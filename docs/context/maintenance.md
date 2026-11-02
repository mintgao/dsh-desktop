# Maintenance handover

English | [中文](maintenance.zh.md)

## Project status

DSH Desktop Mint is in maintenance mode as of 2026-11-02. The official DeepSeek Harness desktop client is available, and the developer has paused this unofficial client's active development, routine upstream adoption, and regular releases. No future updates or support response times are promised. The owner must explicitly reopen development before new feature work.

## Retained materials

The repository's default branch remains the authoritative shared source. The latest published Mint application is [0.1.5-rc.2.unsigned.1](https://github.com/mintgao/dsh-desktop/releases/tag/desktop-v0.1.5-rc.2.unsigned.1); its downloads and earlier release history remain available. The [machine handoff](handoff.md) owns source, data, and installation guidance.

A separate [maintenance archive](https://github.com/mintgao/dsh-desktop/releases/tag/maintenance-archive-20261102) preserves source-only local development changes and commit recovery material. These are historical work-in-progress snapshots, not tested releases or changes accepted into the default branch. Each archive identifies its source base and contents; do not apply an older snapshot wholesale over the default branch.

Credentials, personal sessions, user workspaces, raw local logs, and full machine recovery archives stay private. The public archive is not a backup of application user data. No migration of Mint data to the official client has been validated.

## Automation and outstanding work

Scheduled upstream discovery is disabled. Other manual maintenance workflows remain available; the disabled discovery workflow itself requires re-enabling before either scheduled or manual use. No new release is published by this documentation change.

Open [pull requests](https://github.com/mintgao/dsh-desktop/pulls) and [issues](https://github.com/mintgao/dsh-desktop/issues) are retained as historical proposals and reports, without a delivery commitment. They are not merged or closed as part of the handover. The owner remains responsible for any decision to resume work.

## Resuming work

Review the exact source revision and any archived changes before restoring dependencies. Follow the [development guide](../development.md), [testing policy](../testing.md), and [downstream policy](downstream-policy.md) for a future fix. An archive upload does not certify unfinished code, and a maintenance decision does not establish compatibility with future official releases.
