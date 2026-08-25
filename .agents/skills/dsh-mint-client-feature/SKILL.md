---
name: dsh-mint-client-feature
description: Use when designing, implementing, reviewing, or releasing a DSH Desktop Mint feature, including deciding whether work belongs in a reusable DSH plugin, the desktop-mint product Bundle, or the Electron native bootstrap.
---

# DSH Desktop Mint feature placement

Keep DSH Desktop Mint an opinionated distribution over the DSH plugin harness, not a forked Agent runtime or a second client framework. Read the [product-layer decision](../../notes/implemented/architecture/2026-08-25-downstream-client-product-layer.md) and the [desktop product reference](../../../apps/desktop/README.md) before changing product composition or native behavior.

## Classify the feature

Assign each independent feature to the narrowest owner:

- A reusable DSH plugin owns behavior that can run in another compatible composition.
- The `desktop-mint` Bundle owns which DSH plugins Mint enables and their product defaults. It contains patch rows, not feature implementations.
- A Client plugin owns browser state, settings rows, interaction, and presentation policy.
- A Host capability or provider owns privileged I/O, durable data, transport, and process-wide services needed by a DSH plugin.
- The Electron bootstrap owns application, window, menu, updater, installer, and backend-process lifecycle. It must not infer Agent, Session, or subagent semantics.

A feature may belong to the Mint product without being Mint-only code. Keep a reusable plugin generic and enable it from the Mint Bundle. Put Mint branding, release-channel behavior, and product-specific integrations in Mint-owned packages or native modules. Never add `isMint` branches to shared packages.

If the existing APIs cannot support the feature, add the smallest reusable DSH extension point first and implement the Mint feature as its consumer. Change Agent Loop only when Agent execution itself changes. Anything model-visible remains reconstructable from the Session log.

## Design record

Before implementation, name the user outcome, state owner, execution plane, existing extension point, package or native module, product default, durability, model-visible effect, permissions, disposal behavior, and assembled acceptance path. Keep rationale in an Agent Note; keep current package behavior in its README.

## Implement and compose

- Give every independently changeable feature its own plugin or native module and lifecycle cleanup.
- Put deployment-varying defaults in validated plugin Config and set Mint's choice in the `desktop-mint` Bundle.
- Register Client UI through slots and settings namespaces owned by the feature.
- Use a typed Host or native provider when browser code needs privilege. Keep the bridge narrow and preserve renderer sandboxing.
- Keep native update and installation control in Electron unless a DSH UI consumes it; then expose a capability instead of importing Electron into a Client plugin.
- Enable Mint DSH features only through the Mint Bundle. The shared Web Bundle contains only shared Web product defaults.

## Verify the product selection

Run the focused package tests and coverage for the changed implementation. Prove composition separately:

- the generic `web` Profile excludes Mint-only defaults;
- the `desktop-mint` Profile contains the Mint Bundle and each selected row exactly once;
- a real keyless browser scenario observes user-visible Client behavior;
- a native change passes desktop tests, the packaged-application smoke, and the relevant macOS interaction;
- packaged runtime-closure checks resolve every Mint Bundle dependency.

Use `dsh-pre-push-checks` before publication. Do not push, merge, publish a Release, or replace an installed application unless the user explicitly authorizes that external action.
