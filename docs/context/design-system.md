# Design-system context

English | [中文](design-system.zh.md)

## Product experience principles

- Keep the Web UI a focused developer workbench: navigation, conversation, and optional detail occupy stable regions while transient prompts and approvals stay close to the active task.
- Express meaning through semantic theme tokens and explicit component states; avoid introducing literal colors when an existing alias names the role.
- Reuse the shared primitives and tool-result presentations before creating a new local control or card.
- Preserve code, terminal, diff, and structured-result readability, including intentional no-wrap and horizontal-scroll behavior.
- Treat permissions, risk confirmation, running state, failure, and unavailable actions as visible interaction states rather than hidden runtime facts.

## Foundations

- **Color:** `ui-theme` defines static palettes, semantic `--dsw-alias-*` roles, and component-specific aliases for light and dark modes. The visual base is blue-gray neutral surfaces, DeepSeek blue for brand and selection, and green, amber, and red for success, warning, and error. See [the theme contract](../../packages/client/ui-theme/README.md) and `packages/client/ui-theme/src/styles/design-platform.css`.
- **Theme selection:** built-in `light`, `dark`, and `system` preferences resolve through `prefers-color-scheme`; the layout presenter applies `color-scheme`, `data-ds-dark-theme`, alias overrides, and the document theme color.
- **Typography:** UI text prefers the operating-system sans stack with explicit Chinese fallbacks. Code uses SF Mono, JetBrains Mono, Fira Code, Consolas, Liberation Mono, Menlo, and CJK fallbacks. Markdown and common text roles define paired font-size and line-height values in the theme styles.
- **Motion:** shared transition durations are 0.1, 0.2, and 0.3 seconds on a common ease-in-out curve. Animated surfaces provide reduced-motion branches when their movement is material.
- **Spacing and shape:** layout dimensions and component spacing are locally owned CSS values. Rounded cards and pill controls are common, but the repository has no global spacing, radius, z-index, grid, or density scale.

## Layout and responsive behavior

- The main `AppFrame` is a three-column grid: a 264–420px sidebar (280px default, 56px collapsed rail), a conversation column with a 640px minimum, and a 300–520px detail column (360px default).
- When space contracts, the sidebar collapses below 1024px, the detail column concedes width and then closes, and the conversation column shrinks last. Drag boundaries adjust desktop widths; details is optional and currently has no shipped product occupant.
- Conversation content is centered on a 748px measure. The composer is a raised 22px-radius dock wider than the message measure; user bubbles cap at `min(525px, 82%)`.
- Settings use a centered, viewport-bounded modal with left navigation and an approximately 800px content frame. Feature surfaces add narrower breakpoints near 560–760px rather than relying on one global mobile layout.

## Components and interaction patterns

- Shared React primitives include Button, Pill, Input, Menu, Modal, Toast, Tooltip, DisclosureRow, StateDot, OnboardingSurface, Markdown and JSON renderers, and specialized Terminal, Diff, Read, Search, and Web result blocks; [their reference](../../packages/client/ui-primitives/README.md) owns exact behavior.
- UI features compose through slots around workspace/session navigation, conversation and trajectory views, attachments, model selection, settings, permissions, plans, goals, jobs, Skills, subagents, workflows, user questions, and produced files.
- Controls implement hover, active, focus, disabled, pending, success, warning, and error states. Workspace status uses amber for pending human attention, blue for running, and green for an unseen completed result.
- First-run model configuration uses a blocking onboarding surface. Risk confirmation requires an explicit checkbox before its destructive action becomes available.
- Tool calls use declared render intent: generic disclosures for unknown tools and keyed presentations for terminal, read, diff, search, Web, workflow, and other structured results.

## Accessibility and responsive behavior

- Dialogs, trees, menus, tabs, disclosures, selection controls, live status, and icon-only actions carry ARIA roles or labels in the implemented surfaces. Blocking onboarding makes the underlying application inert, and desktop startup decoration is hidden while status uses `aria-live`.
- Keyboard and focus behavior exists for settings navigation, menus, question flows, confirmation controls, and composer interactions. Preserve visible focus and the `prefers-reduced-motion` paths required by [the Web styling rules](../web-styling.md).
- The repository does not state a WCAG conformance target or provide a general visual-regression suite. Existing interaction tests prove DOM state and behavior, not complete visual or assistive-technology acceptance.
- Known gaps include no general Modal focus trap, no focus trap in the attachment lightbox, pointer-only AppFrame resize handles, and no observed arrow-key/roving-focus implementation in the shared Menu. Do not describe these surfaces as fully keyboard accessible without new evidence.

## Desktop Mint presentation

DSH Desktop Mint uses the same Web design system after startup. Its native startup page is a separate Mint-branded ocean scene with a moving whale, bubbles, and a progress indicator; `prefers-reduced-motion` replaces that motion with a static state. Desktop-specific branding must not leak into upstream Web components.

## Design constraints and unknowns

- Semantic tokens are the color authority for the main UI, but boot fallbacks and a small number of components still contain literal colors; token-only coverage is not universal.
- Pill and Input lack an independent design-source record, and some brand glyphs are hand-authored approximations because exact source vectors are unavailable.
- Dark-theme token application is tested, but repository evidence does not establish manual visual acceptance of every complex surface in both schemes.
- Minimum supported viewport, density modes, formal accessibility targets, and a visual-regression baseline are not documented.
