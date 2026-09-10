# Check the initial desktop installation

English | [中文](bootstrap-installation-check.zh.md)

## Prerequisites

Use the [reviewed delivery decision](../decisions/20260908-desktop-reviewed-delivery.md#bootstrap-installation-evidence). The protected base must contain neither the source lock nor ordinary delivery workflows. The installation PR remains open. Prepare a complete administrator migration attestation and download the actual last published desktop assets, including their checksum file, into a persistent evidence directory. These checks require read access to repository, Actions, releases and administrator controls; they perform no remote writes.

## Capture the completed prior bootstrap

1. Retain an explicit context JSON with `schemaVersion: 1`, `purpose: desktop-bootstrap-installation`, `repository`, numeric `repositoryId`, numeric `pullRequest`, `baseBranch`, `baseCommit`, immutable `tag`, `seedCommit`, `seedTree`, numeric `runId` and numeric `attempt`. Use the completed bootstrap finalization attempt, not the draft probe. Every identity must match live GitHub evidence.
2. Run `pnpm run desktop:delivery migration-preflight --config .github/desktop-delivery/mint.json --lock /path/to/legacy-lock.json --bundle /path/to/assets --admin-evidence /path/to/admin.json --bootstrap-context /path/to/prior-context.json --baseline-output /path/to/baseline.json --out /path/to/migration-report.json`.
3. Inspect the report. Only the explicitly validated installation PR appears under `bootstrapInstallation`; other pending adoptions remain blockers. Without `--bootstrap-context`, the installation PR remains pending. Failed reads, incomplete trees, incorrect bot identity, skipped finalization jobs and changed source lineage reject classification.

## Check the successor before merge

1. Retain the exact successful baseline and migration report bytes in a reviewed successor seed, alongside activation with matching baseline, report and configuration digests. Obtain a substantive bot source-lock finalization from a new immutable bootstrap tag. Do not rewrite historical evidence merely to name its containing successor commit.
2. Save a new context for that completed successor attempt. Run the following command from a checkout containing the exact reviewed files; configuration and migration-report paths must resolve inside `--root`.

```sh
pnpm run desktop:delivery bootstrap-installation-check \
  --root /path/to/reviewed-checkout \
  --config /path/to/reviewed-checkout/.github/desktop-delivery/mint.json \
  --migration-report .github/desktop-delivery/migration-report.json \
  --lock /path/to/legacy-lock.json --bundle /path/to/assets \
  --admin-evidence /path/to/admin.json \
  --bootstrap-context /path/to/successor-context.json \
  --out /path/to/external-installation-check.json
```

3. Require `state: installation-verified` and the actual final head. The external result binds retained evidence digests and observation time. It verifies embedded bytes, refreshes administrator controls and pending adoption, and downloads the actual release assets to verify hashes. Ordinary download counters do not invalidate publication identity; changed release provenance, assets, controls, base or head require correction and another check.
4. Verify actual bot last-pusher identity and owner-review eligibility, then obtain required approval and branch checks for that final head. The observation does not reserve remote state or replace these requirements. Any material change invalidates it. Installed ordinary workflows disable new installation checks; retained historical classification remains readable by activation validation.
