# Contributing to DSH Desktop

English | [中文](CONTRIBUTING.zh.md)

DSH Desktop Mint is an unofficial downstream distribution built on DeepSeek Harness. This repository accepts changes for the desktop application and the harness code required by that application; it does not imply endorsement, cooperation, or authorization from DeepSeek.

The contributor workflow keeps the downstream application releasable while preserving a reviewable path back to the official source repository.

## Repository model

- `origin` is `https://github.com/mintgao/dsh-desktop.git`, the downstream repository that owns desktop releases.
- `upstream` is `https://github.com/deepseek-ai/deepseek-harness.git`, the source of DeepSeek Harness updates.
- `main` contains release-ready downstream code. Work lands through focused branches and pull requests.

## First checkout

Install Git and a Node version manager, then use Node 24 from [`.node-version`](.node-version). Corepack reads the exact pnpm version from `package.json`.

```sh
git clone https://github.com/mintgao/dsh-desktop.git
cd dsh-desktop
git remote add upstream https://github.com/deepseek-ai/deepseek-harness.git
corepack enable
pnpm install --frozen-lockfile
pnpm run test:desktop
pnpm run build:desktop
```

The checkout is ready when both desktop commands succeed. A real backend launch additionally needs `DEEPSEEK_API_KEY` in the environment or the ignored root `.env` file.

## Cross-device work

- Use Git to move source between computers. Do not place a live checkout in iCloud Drive, Dropbox, or another file-synchronization directory.
- Install dependencies and build on each computer. Never copy `node_modules`, `apps/desktop/backend`, `lib`, or `dist` between architectures or operating systems.
- Before leaving one computer, commit the coherent change and push its branch. Temporary work may use a clearly marked work-in-progress commit on that branch.
- On the next computer, run `git fetch origin --prune`, switch to the same branch, and run `git pull --ff-only` before editing.
- Keep `main` clean. Use `feat/<topic>`, `fix/<topic>`, `docs/<topic>`, or `chore/<topic>` for human work and `codex/<topic>` for Codex-owned branches.

## Dependency and generated-file rules

- `pnpm-lock.yaml` is authoritative and must be committed with dependency changes. Ordinary setup uses `pnpm install --frozen-lockfile`.
- The repository stores LF text through `.gitattributes`; do not normalize line endings per device.
- Do not commit build output. The root `.gitignore` owns the current generated and local-state exclusions.
- Run the smallest checks that cover the change, then run `pnpm run typecheck` before push. Documentation changes also run `pnpm run doc-sync`.

## Secrets and local state

- Never commit `.env`, DeepSeek API keys, Apple certificates, App Store Connect keys, session data, or sanitized-looking copies of real credentials.
- `~/.dsh` belongs to the local user and is not synchronized through this repository. Back it up separately only when the backup is encrypted and access-controlled.
- GitHub Actions receives release credentials only through encrypted repository secrets named in the desktop release workflow.
- Logs and issue attachments must remove credentials, personal session content, and private workspace paths before sharing.

## Upstream sync

Sync upstream through a dedicated branch so desktop changes and workflow guards remain reviewable:

```sh
git fetch upstream
git switch main
git pull --ff-only origin main
git switch -c chore/sync-upstream-YYYY-MM-DD
git merge --no-ff upstream/master
```

Resolve conflicts on the sync branch, run checks matched to the changed files, and merge it through a pull request. Do not force-push `main` or rewrite published `desktop-v*` tags.

## Pull requests and releases

- State the user-visible result, list only checks actually run, and mark the affected Mac architectures in the pull request template.
- Keep unrelated changes in separate pull requests. Update the owning documentation and Agent Note for every non-trivial code, process, or release decision.
- Follow the [desktop application reference](apps/desktop/README.md) for local packages and signed releases. Public artifacts come only from the tag-driven release workflow and remain draft until a maintainer reviews both notarized DMGs and their checksums.
