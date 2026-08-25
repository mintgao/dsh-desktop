# Agent Note: Downstream client product layer over the plugin harness

Status: implemented

English | [中文](2026-08-25-downstream-client-product-layer.zh.md)

## Problem

DSH Desktop Mint turns DeepSeek Harness into a user-facing macOS product. Product iteration can easily accumulate session policy in Electron, one-off UI code in a shared shell, or Agent Loop branches for presentation concerns. Those placements would produce a second architecture that still depends on DSH but no longer follows its plugin composition model. The existing [Electron desktop shell](../feature/2026-08-24-electron-desktop-shell.md) owns process and window lifecycle, while [Mint desktop downstream development](../process/2026-08-24-mint-desktop-downstream-development.md) owns repository and release policy; neither decides where product features belong.

## Decision

DSH is the plugin harness and reusable platform. DSH Desktop Mint is a downstream product distribution: a reviewed composition of DSH plugins, product defaults, branding, a macOS native host, and release policy. The product does not fork the Agent runtime or define a parallel client framework. Its differentiation comes from which plugins it composes and how those plugins are configured.

A feature is assigned to the narrowest plane that owns its facts and effects:

- An Agent preset composes model-visible tools, prompt sections, policies, and providers for one Agent. Anything model-visible remains reconstructable from the session log.
- A Host plugin owns privileged I/O, durable data, transport endpoints, and process-wide services. It exposes a typed service, event, Remote endpoint, or another documented extension point instead of leaking its implementation into the client.
- A client plugin owns browser state, user interaction, presentation policy, settings rows, and slot contributions. Each independent product feature is an independently disposable package and registers its own settings surface.
- The native shell adapts operating-system capabilities and owns application, window, menu, update, and process lifecycle. It does not infer Agent or session semantics. A capability that needs native privilege enters through a narrow bridge or provider that a plugin consumes.

The `desktop-mint` Profile composes `dsh-base`, the shared Web Bundle, and `@deepseek-ai/dsh-desktop-mint` before its own user patch. The Mint Bundle is the single DSH feature-selection and product-default source; it contains patch rows rather than feature implementations. Future product releases change that Bundle without changing the Profile tuple, while a user can still add a later Profile patch or an extra Bundle.

The task-completion notification is the first explicit application of this rule. `@deepseek-ai/dsh-client-ui-session-notifications` observes the public session-list snapshot, registers its own General settings row, and uses the renderer's Web Notifications API. Electron maps that standard API to macOS Notification Center, so its main process receives no task lifecycle branch or renderer bridge. The plugin stays reusable and defaults to off when a composition makes no product choice; the Mint Bundle alone mounts it with `defaultMode: background`. The generic `web` Profile does not inherit that selection.

Every proposed product feature starts with a short feature record that names the user outcome, owning plane, source of truth, existing extension point, new package or provider, settings and durability, model-visible effect, permission or privacy implications, disposal behavior, and assembled acceptance path. If no extension point can support the feature, the platform change introduces the smallest reusable extension first and then implements the product feature as its consumer. Agent Loop edits remain the last resort and require an Agent lifecycle responsibility, not merely a convenient observation point. The repository's [dsh-mint-client-feature](../../../skills/dsh-mint-client-feature/SKILL.md) workflow carries these rules into later Agent sessions.

Feature delivery keeps three review units explicit: the reusable plugin or provider, the product composition change that enables it, and product-level acceptance evidence. Non-trivial decisions receive an Agent Note; user-visible behavior receives a keyless snapshot through the real composition; native integration additionally receives focused platform tests. Release notes describe the product outcome without making the Electron shell the feature owner.

## Alternatives considered

**Put product behavior directly in the Electron main process.** This is appropriate for window and application lifecycle but would force the shell to duplicate session ancestry, completion, reconnect, and interaction semantics. It also makes the same feature unavailable to other DSH clients.

**Maintain a monolithic Mint client fork.** A separate renderer gives complete local control but abandons slot composition, duplicates the shared client runtime, and turns every upstream sync into a manual UI merge.

**Add product branches to Agent Loop.** Presentation and operating-system effects do not change Agent execution. Putting them in the loop couples model behavior to one distribution and bypasses the client state already designed for observers.

**Place every Mint feature in the shared Web bundle.** Generic features can graduate there, but product-specific defaults, branding, integrations, and experiments would expand the upstream product surface. A Mint overlay keeps selection separate while reusing the same packages and runtime.

## Verification

Package tests cover notification transition policy, subagent aggregation, pending-interaction suppression, permission states, click navigation, settings persistence, and disposal. Config-dump coverage proves the generic `web` Profile excludes the notification row and the `desktop-mint` Profile includes it exactly once with the Mint default. A keyless browser test applies the Mint Bundle over the shipped Web tree and captures the system-notification payload after a real Agent status transition. Documentation and configuration gates verify the package manifests, client roster, bilingual references, and invariant companions.

Future features use the feature record during design review and prove the selected plane through a composition-level test. A review rejects Electron code that imports or recreates Agent lifecycle semantics, client features without independent plugin ownership, model-visible inputs without session events, and product-only packages enabled implicitly outside the Mint composition.

## Consequences

DSH Desktop Mint remains recognizable as a product while staying structurally close to upstream DSH. Small features carry more explicit package, composition, test, and documentation work than a local conditional, but they can be removed, replaced, tested, and upstreamed independently. Generic packages may be reused or upstreamed without making their defaults part of the shared Web product; Mint's choices remain in its downstream Bundle. Native capabilities may require additional providers or bridges, but the Electron shell stays an operating-system host rather than a second harness.
