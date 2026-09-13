# Hosted forward-update capability probe

English | [中文](20260913-forward-native-capability.zh.md)

Status: Accepted

## Scope

The [approved probe design](../work-items/20260911-desktop-update-path/forward-probe-draft.json) defines an Intel macOS capability check using authenticated retained A. It does not qualify an update, change release policy or authorize source upload. Full forward-update implementation remains blocked until this capability is observed.

## Ownership and alternatives

The existing PID-scoped Accessibility helper owns window-content observation and ordinary application-menu Quit. A separate bounded runner owns LaunchServices entry, exact executable identity, private roots, deadlines and cleanup. The fixed-descriptor validator owns artifact authentication; the input-free protected workflow retrieves artifacts before removing credentials from execution. Extending the inspector-based migration runner would confuse diagnostic launch with ordinary entry. A general GUI framework adds no required capability.

## Execution and failure

Use native x64 on macos-15-intel with the exact pinned A archive, candidate, installer and runtime identities. Stage authenticated bytes with existing immutable-copy helpers. Launch the exact app through LaunchServices with private home, agents, workspace, temporary and Electron user-data roots, an empty SSH authentication socket and telemetry disabled. Do not expose retrieval credentials to the app.

One experiment has a 120-second deadline with 30 seconds reserved for cleanup. Verify exact executable/PID identity before each Accessibility action. Require accessible rendered onboarding content, ordinary Quit, stopped app/backend, normal reopen and another ordinary Quit. A window without rendered content is insufficient. Missing permission blocks execution; do not grant permission, inject a debugger, reset system security or substitute direct executable entry.

Preserve the first failure and terminate only identity-verified owned processes. Record artifact identities, launch mode, declared roots, observations and cleanup with purpose desktop-forward-native-capability and qualificationEligible false. Export no profiles, credentials or raw logs. A failed probe stops full-policy work. A rejected or timed-out launch with unresolved completion leaves cleanup uncertain even after an empty process inventory. Retain both application and data roots, preserve the first failure and record that final disposable-runner teardown supplies containment; do not claim all processes stopped.

Failure receipts retain only a fixed operation/category, observable numeric subprocess exit or allowlisted signal/timeout status, and the last main-process inventory with explicit freshness. Diagnostic failures preserve the first failure and never export exception messages or subprocess output.

## Verification

Focused tests cover pinned input refusal, process identity, deadlines, observation failure and cleanup. Exact outbound authorization and authenticated x64 inputs remain execution prerequisites. The independent review approves only this probe design.
