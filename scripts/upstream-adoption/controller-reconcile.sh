#!/usr/bin/env bash
# Reconcile the authoritative queue head after the workflow binds trusted credentials and state.
set -e -o pipefail

state="$RUNNER_TEMP/upstream-adoption.json"
force_retry=false
if [[ -n "$QUEUE_HEAD" || -n "$REASON" || "$RESUME" == true ]]; then
  test -n "$QUEUE_HEAD"
  test -n "$REASON"
  expected_target="$(jq -r '.activeDelivery.upstream.tag // "idle"' "$state")"
  if [[ "$QUEUE_HEAD" != "$expected_target" ]]; then
    echo "Manual force must target authoritative queue head $expected_target." >&2
    exit 1
  fi
  force_retry=true
fi
issue_number_by_title() {
  local desired_title="$1"
  local issue_state="$2"
  gh api --paginate "repos/$GITHUB_REPOSITORY/issues?state=$issue_state&per_page=100" --slurp \
    | jq -r --arg title "$desired_title" '[.[][] | select(has("pull_request") | not) | select(.title == $title)][0].number // empty'
}
open_context_circuit() {
  local stage="$1"
  local run_id="$2"
  local input_key="$3"
  local title='Blocked: upstream adoption control plane'
  local issue body current desired
  printf -v body 'Phase: `control-plane-blocked`\nFailure: `%s` run `%s` failed before its protected attempt context was available.\nInput key: `%s`\nAutomation: Scheduled reconciliations are successful no-ops until this circuit-breaker Issue is closed or the Controller is manually resumed.\n\nRecovery: inspect the failed bootstrap job, repair the runner or control plane, then manually resume the Controller with the exact queue head and a reason.' "$stage" "$run_id" "$input_key"
  issue="$(issue_number_by_title "$title" open)"
  if [[ -z "$issue" ]]; then
    gh issue create --title "$title" --body "$body" >/dev/null
    return
  fi
  current="$(gh issue view "$issue" --json title,body --jq '[.title,.body] | @tsv')"
  desired="$(printf '%s\t%s' "$title" "$body")"
  if [[ "$current" != "$desired" ]]; then gh issue edit "$issue" --title "$title" --body "$body" >/dev/null; fi
}
open_attempt_blocker() {
  local stage="$1"
  local run_id="$2"
  local queue_head="$3"
  local input_key="$4"
  local title="Blocked: deliver DeepSeek Harness $queue_head"
  local issue body current desired
  printf -v body 'Queue head: `%s`\nPhase: `%s-blocked`\nFailure: the exact protected attempt run `%s` failed.\nInput key: `%s`\nAutomation: unchanged scheduled reconciliations are successful no-ops.\n\nRecovery: inspect the failed run, fix the blocker or change an authoritative input, then manually dispatch the Controller with this exact queue head and a reason.' "$queue_head" "$stage" "$run_id" "$input_key"
  issue="$(issue_number_by_title "$title" open)"
  if [[ -z "$issue" ]]; then
    gh issue create --title "$title" --body "$body" >/dev/null
    return
  fi
  current="$(gh issue view "$issue" --json title,body --jq '[.title,.body] | @tsv')"
  desired="$(printf '%s\t%s' "$title" "$body")"
  if [[ "$current" != "$desired" ]]; then gh issue edit "$issue" --title "$title" --body "$body" >/dev/null; fi
}
abort_conflicted_merge() {
  local stage="$1"
  if ! git rev-parse -q --verify MERGE_HEAD >/dev/null; then
    echo "$stage failed before Git entered a merge-conflict state." >&2
    exit 1
  fi
  git merge --abort
}
ensure_complete_origin_history() {
  if [[ "$(git rev-parse --is-shallow-repository)" == true ]]; then
    git fetch --unshallow origin
  fi
}
write_conflict_paths() {
  local output="$1"
  git diff --name-only --diff-filter=U | sort | jq -R . | jq -s . > "$output"
}
retry_completed_cleanup() {
  local delivered_queue delivered_desktop blocked_title issue candidate_branch pr body
  delivered_queue="$(jq -r '.lastPublishedRelease.tag // empty' "$state")"
  delivered_desktop="$(jq -r '.lastPublishedRelease.desktopTag // empty' "$state")"
  [[ -n "$delivered_queue" && -n "$delivered_desktop" ]] || return 0
  if ! gh release view "$delivered_desktop" --repo "$GITHUB_REPOSITORY" --json isDraft,tagName \
    | jq -e --arg tag "$delivered_desktop" '.isDraft == false and .tagName == $tag' >/dev/null; then
    return 0
  fi
  blocked_title="Blocked: deliver DeepSeek Harness $delivered_queue"
  issue="$(issue_number_by_title "$blocked_title" open)"
  if [[ -n "$issue" ]]; then
    body="Delivered \`$delivered_queue\` as verified public Release \`$delivered_desktop\`. The protected publication cursor has advanced; later upstream Releases remain ordered behind it."
    gh issue edit "$issue" --body "$body" || return 1
    gh issue close "$issue" --reason completed || return 1
  fi
  candidate_branch="automation/adopt/${delivered_queue//[^0-9A-Za-z._-]/-}"
  pr="$(gh pr list --head "$candidate_branch" --state open --json number --jq '.[0].number // empty')"
  if [[ -n "$pr" ]]; then
    gh pr close "$pr" --comment "Delivered as $delivered_desktop after verified publication." || return 1
  fi
  if gh api "repos/$GITHUB_REPOSITORY/git/ref/heads/$candidate_branch" >/dev/null 2>&1; then
    gh api --method DELETE "repos/$GITHUB_REPOSITORY/git/refs/heads/$candidate_branch" || return 1
  fi
}
matching_attempt_run() {
  local workflow_path="$1"
  local artifact_name="$2"
  local expected_path="$3"
  local expected_title="$4"
  gh api --paginate "repos/$GITHUB_REPOSITORY/actions/workflows/$workflow_path/runs?event=repository_dispatch&per_page=100" --slurp \
    | jq '[.[].workflow_runs[]] | sort_by(.created_at) | reverse' > "$RUNNER_TEMP/workflow-runs.json"
  while IFS= read -r run; do
    local run_id run_status run_conclusion artifact_dir artifact_path run_title
    run_id="$(jq -r '.id' <<< "$run")"
    run_status="$(jq -r '.status' <<< "$run")"
    run_conclusion="$(jq -r '.conclusion // empty' <<< "$run")"
    artifact_dir="$RUNNER_TEMP/$artifact_name-$run_id"
    artifact_path="$artifact_dir/$artifact_name.json"
    if gh run download "$run_id" --name "$artifact_name" --dir "$artifact_dir" >/dev/null 2>&1; then
      if jq -e --slurpfile expected "$expected_path" '$expected[0] == (del(.runId,.runAttempt))' "$artifact_path" >/dev/null; then
        if [[ "$run_status" == queued || "$run_status" == in_progress || "$run_status" == waiting ]]; then
          printf 'active:%s\n' "$run_id"
          return 0
        fi
        if [[ -n "$run_conclusion" && "$run_conclusion" != success && "$run_conclusion" != skipped ]]; then
          printf 'failed:%s\n' "$run_id"
          return 0
        fi
        if [[ "$run_conclusion" == success ]]; then
          printf 'succeeded:%s\n' "$run_id"
          return 0
        fi
      fi
      continue
    fi
    run_title="$(jq -r '.display_title' <<< "$run")"
    [[ "$run_title" == "$expected_title" ]] || continue
    if [[ "$run_status" == queued || "$run_status" == in_progress || "$run_status" == waiting ]]; then
      printf 'active:%s\n' "$run_id"
      return 0
    elif [[ -n "$run_conclusion" && "$run_conclusion" != success && "$run_conclusion" != skipped ]]; then
      printf 'context-missing:%s\n' "$run_id"
      return 0
    fi
  done < <(jq -c '.[]' "$RUNNER_TEMP/workflow-runs.json")
  return 1
}
circuit_title='Blocked: upstream adoption control plane'
circuit_issue="$(issue_number_by_title "$circuit_title" open)"
if [[ -n "$circuit_issue" && "$RESUME" != true ]]; then
  echo "Open circuit-breaker Issue #$circuit_issue pauses reconciliation. Scheduled reconciliations are successful no-ops until this circuit-breaker Issue is closed or the Controller is manually resumed." >> "$GITHUB_STEP_SUMMARY"
  exit 0
fi
if [[ -n "$circuit_issue" && "$RESUME" == true ]]; then
  gh issue close "$circuit_issue" --reason completed
fi
if ! retry_completed_cleanup; then
  echo 'Verified publication cleanup is still incomplete; the next scheduled reconcile will retry the same exact debt without failing this run.' >> "$GITHUB_STEP_SUMMARY"
  exit 0
fi
phase="$(jq -r '.activeDelivery.phase // "idle"' "$state")"
if [[ "$phase" == idle ]]; then
  gh api --method POST "repos/$GITHUB_REPOSITORY/dispatches" -f event_type=upstream-adoption-detect -f "client_payload[controller_run]=$GITHUB_RUN_ID"
  exit 0
fi
queue_head="$(jq -r '.activeDelivery.upstream.tag' "$state")"
if [[ "$phase" == release-pending || "$phase" == publication-blocked ]]; then
  if [[ "$phase" == publication-blocked ]]; then
    current_main="$(git rev-parse origin/main)"
    input_key="$(pnpm exec tsx scripts/upstream-adoption/cli.ts input-key "$state" "$current_main")"
    decision="$(pnpm exec tsx scripts/upstream-adoption/cli.ts attempt-decision "$state" "$input_key" ${QUEUE_HEAD:+"$QUEUE_HEAD"} ${REASON:+"$REASON"})"
    if [[ "$(jq -r '.action' <<< "$decision")" == noop ]]; then
      echo "Known publication blocker: $(jq -r '.reason' <<< "$decision"). No release mutation was attempted." >> "$GITHUB_STEP_SUMMARY"
      exit 0
    fi
  fi
  release_tag="$(jq -r '.activeDelivery.desktopTag' "$state")"
  validation_run="$(jq -r '.activeDelivery.artifacts.runId' "$state")"
  input_key="$(jq -r '.activeDelivery.attempt.inputKey' "$state")"
  jq -n \
    --arg state_ref_commit "$(git rev-parse refs/remotes/origin/automation/upstream-adoption-state)" \
    --argjson state_revision "$(jq -r '.revision' "$state")" \
    --arg input_key "$(jq -r '.activeDelivery.attempt.inputKey' "$state")" \
    --arg release_tag "$release_tag" \
    --arg source_commit "$(jq -r '.activeDelivery.artifacts.sourceCommit' "$state")" \
    --argjson validation_run "$validation_run" \
    '{schemaVersion:1,kind:"publication",stateRefCommit:$state_ref_commit,stateRevision:$state_revision,inputKey:$input_key,releaseTag:$release_tag,sourceCommit:$source_commit,validationRun:$validation_run}' \
    > "$RUNNER_TEMP/publication-context-expected.json"
  if [[ "$force_retry" != true ]] && matched_run="$(matching_attempt_run desktop-release.yml publication-attempt-context "$RUNNER_TEMP/publication-context-expected.json" "Publish desktop attempt $input_key")"; then
    case "$matched_run" in
      active:*)
        echo "Publication run ${matched_run#*:} is already active for the current authoritative input; reconciliation is a successful no-op." >> "$GITHUB_STEP_SUMMARY"
        ;;
      failed:*)
        open_attempt_blocker publication "${matched_run#*:}" "$queue_head" "$input_key"
        echo "Publication run ${matched_run#*:} already failed for the current authoritative input; reconciliation is a successful no-op until that input changes or a manual force is recorded." >> "$GITHUB_STEP_SUMMARY"
        ;;
      succeeded:*)
        echo "Publication run ${matched_run#*:} already succeeded for the current authoritative input; reconciliation is waiting for the trusted Observer and is a successful no-op." >> "$GITHUB_STEP_SUMMARY"
        ;;
      context-missing:*)
        open_context_circuit publication "${matched_run#*:}" "$input_key"
        echo "Publication run ${matched_run#*:} failed before uploading protected context; one circuit-breaker Issue now makes later schedules successful no-ops." >> "$GITHUB_STEP_SUMMARY"
        ;;
    esac
    exit 0
  fi
  active="$(gh run list --workflow desktop-release.yml --limit 20 --json status --jq '[.[] | select(.status == "queued" or .status == "in_progress" or .status == "waiting")] | length')"
  if [[ "$active" == 0 ]]; then
    gh api --method POST "repos/$GITHUB_REPOSITORY/dispatches" -f event_type=upstream-adoption-publish -f "client_payload[input_key]=$input_key" -f "client_payload[release_tag]=$release_tag" -f "client_payload[validation_run]=$validation_run"
  else
    echo 'Publication is already active; reconciliation is a successful no-op.' >> "$GITHUB_STEP_SUMMARY"
  fi
  exit 0
fi
if [[ "$phase" == candidate-open ]]; then
  jq -n \
    --arg state_ref_commit "$(git rev-parse refs/remotes/origin/automation/upstream-adoption-state)" \
    --argjson state_revision "$(jq -r '.revision' "$state")" \
    --arg input_key "$(jq -r '.activeDelivery.attempt.inputKey' "$state")" \
    --arg candidate_commit "$(jq -r '.activeDelivery.candidate.headCommit' "$state")" \
    --arg base_commit "$(jq -r '.activeDelivery.candidate.baseCommit' "$state")" \
    --arg upstream_commit "$(jq -r '.activeDelivery.upstream.commit' "$state")" \
    --arg desktop_tag "$(jq -r '.activeDelivery.desktopTag' "$state")" \
    '{schemaVersion:1,kind:"validation",stateRefCommit:$state_ref_commit,stateRevision:$state_revision,inputKey:$input_key,candidateCommit:$candidate_commit,baseCommit:$base_commit,upstreamCommit:$upstream_commit,desktopTag:$desktop_tag}' \
    > "$RUNNER_TEMP/validation-context-expected.json"
  input_key="$(jq -r '.activeDelivery.attempt.inputKey' "$state")"
  if [[ "$force_retry" != true ]] && matched_run="$(matching_attempt_run upstream-adoption-validation.yml validation-attempt-context "$RUNNER_TEMP/validation-context-expected.json" "Validate upstream attempt $input_key")"; then
    case "$matched_run" in
      active:*)
        echo "Validation run ${matched_run#*:} is already active for the current authoritative input; reconciliation is a successful no-op." >> "$GITHUB_STEP_SUMMARY"
        ;;
      failed:*)
        open_attempt_blocker validation "${matched_run#*:}" "$queue_head" "$input_key"
        echo "Validation run ${matched_run#*:} already failed for the current authoritative input; reconciliation is a successful no-op until that input changes or a manual force is recorded." >> "$GITHUB_STEP_SUMMARY"
        ;;
      succeeded:*)
        echo "Validation run ${matched_run#*:} already succeeded for the current authoritative input; reconciliation is waiting for the trusted Observer and is a successful no-op." >> "$GITHUB_STEP_SUMMARY"
        ;;
      context-missing:*)
        open_context_circuit validation "${matched_run#*:}" "$input_key"
        echo "Validation run ${matched_run#*:} failed before uploading protected context; one circuit-breaker Issue now makes later schedules successful no-ops." >> "$GITHUB_STEP_SUMMARY"
        ;;
    esac
    exit 0
  fi
  active_validation="$(gh run list --workflow upstream-adoption-validation.yml --limit 20 --json status --jq '[.[] | select(.status == "queued" or .status == "in_progress" or .status == "waiting")] | length')"
  if [[ "$active_validation" != 0 ]]; then
    echo 'Candidate validation is active; reconciliation is a successful no-op.' >> "$GITHUB_STEP_SUMMARY"
    exit 0
  fi
  gh api --method POST "repos/$GITHUB_REPOSITORY/dispatches" -f event_type=upstream-adoption-candidate -f "client_payload[queue_head]=$queue_head"
  exit 0
fi
if [[ "$phase" == candidate-validated || "$phase" == artifacts-validated ]]; then
  echo 'Trusted finalization is in progress; reconciliation is a successful no-op.' >> "$GITHUB_STEP_SUMMARY"
  exit 0
fi
ensure_complete_origin_history
current_main="$(git rev-parse origin/main)"
input_key="$(pnpm exec tsx scripts/upstream-adoption/cli.ts input-key "$state" "$current_main")"
candidate_branch="automation/adopt/${queue_head//[^0-9A-Za-z._-]/-}"
if [[ "$phase" == adoption-blocked || "$phase" == candidate-stale ]]; then
  remote_head="$(git ls-remote origin "refs/heads/$candidate_branch" | cut -f 1)"
  pr="$(jq -r '.activeDelivery.candidate.pr // empty' "$state")"
  if [[ -n "$pr" ]]; then
    GH_TOKEN="$CONTROLLER_TOKEN" gh api --paginate "repos/$GITHUB_REPOSITORY/pulls/$pr/reviews?per_page=100" --slurp | jq '[.[][]]' > "$RUNNER_TEMP/reviews.json"
    approved_head=''
    if [[ -n "$remote_head" ]]; then
      mapfile -t approvers < <(jq -r --arg head "$remote_head" 'sort_by(.id) | group_by(.user.login) | map(last)[] | select(.state == "APPROVED" and .commit_id == $head) | .user.login' "$RUNNER_TEMP/reviews.json")
      for login in "${approvers[@]}"; do
        permission="$(GH_TOKEN="$CONTROLLER_TOKEN" gh api "repos/$GITHUB_REPOSITORY/collaborators/$login/permission" --jq '.permission')"
        if [[ "$permission" == admin || "$permission" == maintain ]]; then approved_head="$remote_head"; break; fi
      done
    fi
    jq -n --arg head "${remote_head:-}" --arg approved "${approved_head:-}" \
      '{headCommit:(if $head=="" then empty else $head end),approvedHead:(if $approved=="" then null else $approved end)}' \
      > "$RUNNER_TEMP/input-key-candidate.json"
    input_key="$(pnpm exec tsx scripts/upstream-adoption/cli.ts input-key "$state" "$current_main" "$RUNNER_TEMP/input-key-candidate.json")"
  fi
fi
decision="$(pnpm exec tsx scripts/upstream-adoption/cli.ts attempt-decision "$state" "$input_key" ${QUEUE_HEAD:+"$QUEUE_HEAD"} ${REASON:+"$REASON"})"
if [[ "$(jq -r '.action' <<< "$decision")" == noop ]]; then
  echo "Known blocker: $(jq -r '.reason' <<< "$decision"). No PR or Issue mutation was attempted." >> "$GITHUB_STEP_SUMMARY"
  exit 0
fi
upstream_commit="$(jq -r '.activeDelivery.upstream.commit' "$state")"
git remote add upstream https://github.com/deepseek-ai/deepseek-harness.git
git fetch upstream "refs/tags/$queue_head:refs/tags/$queue_head"
test "$(git rev-parse "$queue_head^{commit}")" = "$upstream_commit"
git config user.name "$CONTROLLER_APP_SLUG[bot]"
git config user.email "$CONTROLLER_APP_ID+$CONTROLLER_APP_SLUG[bot]@users.noreply.github.com"
controller_wrote=false
if git ls-remote --exit-code origin "refs/heads/$candidate_branch" >/dev/null 2>&1; then
  git fetch origin "refs/heads/$candidate_branch:refs/remotes/origin/$candidate_branch"
  git switch --create "$candidate_branch" --track "origin/$candidate_branch"
  if ! git merge-base --is-ancestor origin/main HEAD; then
    if ! git merge --no-ff origin/main -m "chore(release): refresh $queue_head on current main"; then
      conflict_paths="$RUNNER_TEMP/base-refresh-conflict-paths.json"
      write_conflict_paths "$conflict_paths"
      abort_conflicted_merge 'Candidate base refresh'
      request_path=".github/upstream-adoption-requests/${queue_head//[^0-9A-Za-z._-]/-}.json"
      mkdir -p "$(dirname "$request_path")"
      jq -n --arg upstreamTag "$queue_head" --arg upstreamCommit "$upstream_commit" --arg baseCommit "$current_main" --arg desktopTag "$(jq -r '.activeDelivery.desktopTag' "$state")" --argjson stateRevision "$(jq -r '.revision' "$state")" --slurpfile conflictPaths "$conflict_paths" --arg branch "$candidate_branch" '{schemaVersion:1,kind:"base-refresh",upstreamTag:$upstreamTag,upstreamCommit:$upstreamCommit,baseCommit:$baseCommit,desktopTag:$desktopTag,stateRevision:$stateRevision,conflictPaths:$conflictPaths[0],recovery:["git fetch origin main","git switch "+$branch,"git merge --no-ff origin/main","resolve every listed conflict by ownership, remove this request, run focused checks, and push without force"]}' > "$request_path"
      git add "$request_path"
      git commit -m "chore(release): request base refresh for $queue_head"
    fi
    git remote set-url origin "https://x-access-token:${CONTROLLER_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
    git push origin "$candidate_branch:refs/heads/$candidate_branch"
    controller_wrote=true
  fi
else
  git switch --create "$candidate_branch" origin/main
  if ! git merge --no-ff "$upstream_commit" -m "chore: merge upstream DSH $queue_head"; then
    conflict_paths="$RUNNER_TEMP/upstream-merge-conflict-paths.json"
    write_conflict_paths "$conflict_paths"
    abort_conflicted_merge 'Upstream adoption merge'
    request_path=".github/upstream-adoption-requests/${queue_head//[^0-9A-Za-z._-]/-}.json"
    mkdir -p "$(dirname "$request_path")"
    jq -n --arg upstreamTag "$queue_head" --arg upstreamCommit "$upstream_commit" --arg baseCommit "$current_main" --arg desktopTag "$(jq -r '.activeDelivery.desktopTag' "$state")" --argjson stateRevision "$(jq -r '.revision' "$state")" --slurpfile conflictPaths "$conflict_paths" --arg branch "$candidate_branch" '{schemaVersion:1,kind:"upstream-merge",upstreamTag:$upstreamTag,upstreamCommit:$upstreamCommit,baseCommit:$baseCommit,desktopTag:$desktopTag,stateRevision:$stateRevision,conflictPaths:$conflictPaths[0],recovery:["git fetch upstream refs/tags/"+$upstreamTag,"git switch "+$branch,"git merge --no-ff "+$upstreamCommit,"resolve every listed conflict by ownership, remove this request, run focused checks, and push without force"]}' > "$request_path"
    git add "$request_path"
    git commit -m "chore(release): request resolution for $queue_head"
  fi
  git remote set-url origin "https://x-access-token:${CONTROLLER_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
  git push origin "$candidate_branch:refs/heads/$candidate_branch"
  controller_wrote=true
fi
candidate_head="$(git ls-remote origin "refs/heads/$candidate_branch" | cut -f 1)"
test -n "$candidate_head"
if [[ "$controller_wrote" == true ]]; then
  gh api --method POST "repos/$GITHUB_REPOSITORY/statuses/$candidate_head" \
    -f state=success \
    -f context=dsh/upstream-adoption/controller-head \
    -f description='Candidate head last written by the Controller App' \
    -f "target_url=https://github.com/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"
fi
pr="$(gh pr list --head "$candidate_branch" --state all --json number --jq '.[0].number // empty')"
if [[ -z "$pr" ]]; then
  pr="$(gh api --method POST "repos/$GITHUB_REPOSITORY/pulls" \
    -f base=main \
    -f head="$candidate_branch" \
    -f title="Adopt $queue_head for DSH Desktop Mint" \
    -f body="Pinned upstream commit: \`$upstream_commit\`. This PR is owned by the transactional upstream-adoption state machine." \
    --jq '.number')"
fi
request_path=".github/upstream-adoption-requests/${queue_head//[^0-9A-Za-z._-]/-}.json"
if git cat-file -e "refs/remotes/origin/$candidate_branch:$request_path" 2>/dev/null || git cat-file -e "HEAD:$request_path" 2>/dev/null; then
  title="Blocked: deliver DeepSeek Harness $queue_head"
  issue="$(issue_number_by_title "$title" open)"
  printf -v body 'Queue head: %s\nPinned commit: %s\nIntegration PR: #%s\nPhase: adoption-blocked\nRecovery: follow %s on the candidate branch, remove the request after the exact merge, and push without force.' "$queue_head" "$upstream_commit" "$pr" "$request_path"
  if [[ -z "$issue" ]]; then
    gh issue create --title "$title" --body "$body"
  else
    current_body="$(gh issue view "$issue" --json body --jq '.body')"
    if [[ "$current_body" != "$body" ]]; then gh issue edit "$issue" --title "$title" --body "$body"; fi
  fi
fi
gh api --method POST "repos/$GITHUB_REPOSITORY/dispatches" -f event_type=upstream-adoption-candidate -f "client_payload[queue_head]=$queue_head" -F "client_payload[pr]=$pr"
