# Feishu and WeChat remote channel connections

English | [中文](brief.zh.md)

- ID: `20260919-remote-channel-connections`
- Size: `L`
- Status: shaping
- Created: 2026-09-19

## Technical decision readiness

- Outcome: `decision-accepted`
- Trigger evidence: a new durable capability seam and ownership model (`ctx.channels` Service Definition, providers, and a Session-binding Consumer); a new merge-extensible model-visible message source and its provenance; a durable conversation-binding store; authentication, sender authorization, a remote tool-execution permission boundary, and a permission answerer reachable from outside the machine; cross-system transport against an external platform; irreversible platform state (a platform session and its token) with recovery and disconnection behavior; and a material trade-off between bundling a third-party transport and implementing the protocol against Node builtins
- Decision owner: Tech Lead `remote_channel_architecture`
- Governing decision: `docs/decisions/0001-remote-channel-connections.md`
- No-new-decision rationale: none
- Review mode: `independent-agent`
- Review result: `approved`
- Review evidence: `docs/work-items/20260919-remote-channel-connections/technical-review.md`
- Material product decisions: resolved by the product owner on 2026-09-19 — DSH Desktop Mint distributes a selected feature set over the upstream Harness, in the relationship a Linux distribution has to its upstream, so a new product outcome is in scope; WeChat ships first and further platforms follow once it validates; outbound carries the agent's final reply only; direct messages only; conversation management is command-driven; `/new` unbinds immediately and the next ordinary message creates the Session; conversation commands stay out of the desktop composer; a relayed permission question presents numbered options answered by number; a conversation may hold several pending questions at once, so the reply names the question it answers; and a conversation-created Session carries no explicit title, leaving naming to the composition's title capability
- Open blockers: none
- Gate: `implementation-ready`
- Gate owner: Workflow orchestrator
- Confirmed at: 2026-09-19T06:20:06Z
- Confirmation basis: the orchestrator checked the accepted governing decision `docs/decisions/0001-remote-channel-connections.md`, the recorded review passes in `docs/work-items/20260919-remote-channel-connections/technical-review.md` — two `changes-required` passes whose findings were resolved, a third approving the revised sections against `packages/webhook/webhook/src/session.ts` and `packages/storage/storage-domain/README.md`, and a final pass approving the corrected token-lock paragraph — the material product decisions resolved in this brief, and `Open blockers: none`
- Readiness history: 2026-09-19 the orchestrator ran the trigger scan during design and found durable, cross-system, authentication, permission, and recovery triggers; the record started `decision-required + blocked` with no application code edited; the product owner then resolved every material product decision and approved the feature as a distribution outcome; the same day the Tech Lead perspective `remote_channel_architecture` authored `docs/decisions/0001-remote-channel-connections.md`, which moved the outcome to `decision-accepted`; three review passes followed, the last two approving the revised sections and the corrected token-lock paragraph, and the orchestrator confirmed `implementation-ready` at 2026-09-19T06:20:06Z

## Goal

A DSH Desktop Mint user connects a WeChat account to the running desktop application and then talks to the same agent from a phone: a direct message becomes a durable Session turn, and the agent's final reply returns to that conversation. The connection is set up, monitored, and disconnected from inside the client, with the platform's prerequisites explained in the product rather than in external documentation. Further messaging platforms reuse the same seam.

## Context

[Downstream policy](../../context/downstream-policy.md) approves two product requirements: a desktop client, and delivery of DSH updates. The product owner resolves the third outcome on 2026-09-19: Desktop Mint distributes useful features the way a Linux distribution ships its own selection and defaults over an upstream kernel, so adding a feature is in scope once its design and its maintenance cost are accepted.

Relevant existing mechanisms:

- `packages/client/ui-session-notifications` is the precedent for this work's packaging: a reusable client plugin that lives in `packages/`, is packed as a Mint extension, and is enabled only by the Mint Bundle.
- The [Webhook subsystem](../../subsystems/webhook.md) is the precedent for admitting external input as a Session: an authenticated delivery becomes a root Session whose first follow-up carries `source.kind: 'webhook'` provenance.
- `packages/client/ui-settings-models` is the precedent for guided credential setup: write-only secret input, per-field validation, and a blocking first-run surface.
- The [commands subsystem](../../subsystems/commands.md) is the precedent for human controls that do not become model messages: plugins register `/name` commands, an interactive adapter executes them against an exact agent, and each run is logged as `command/run` and `command/done` while the result stays out of model history. `plan-mode`, `command-compact`, `command-goal`, `permission-presets`, `command-feedback`, and `session-log-export` already register commands.
- The [approval subsystem](../../subsystems/approval.md) is the precedent for answering a permission question from a surface outside the desktop: `approval/request` is an answerer waterfall, and a UI answerer answers only for agents it owns.
- `ctx.storageDomain` ([storage group](../../../packages/storage/README.md)) provides schema-validated durable records with change notifications.
- `MessageSourceMap` in `@deepseek-ai/dsh-llm` is merge-extensible; `webhook` and `agent-team` already extend it, so a new producer adds no Session format version.

Transport facts verified on 2026-09-19:

- **WeChat.** Tencent's iLink Bot API at `https://ilinkai.weixin.qq.com` is the official personal-account bot channel: an HTTP/JSON API whose login is a QR scan, whose inbound path is a cursor-based long poll (`get_updates`, roughly 35-second timeout), whose outbound path is `send_message`, and whose media path is a CDN with AES-128-ECB encryption. An iLink bot identity (for example `aa1204e585c5@im.bot`) is distinct from a personal WeChat account, serves direct messages reliably, and accepts only one polling client per token. The official `@tencent-weixin/openclaw-weixin` package (MIT, 2.4.9) is an OpenClaw channel plugin rather than a standalone library; the MIT `cc-weixin` project carries a platform-agnostic TypeScript implementation of the same protocol.
- **Feishu**, for the second delivery. The official `@larksuiteoapi/node-sdk` (MIT, 1.74.0) exposes `WSClient`, a WebSocket long connection that receives subscribed events without a public URL, domain, or tunnel; the SDK owns the connection handshake and authentication. Feishu documents that long connection requires a 企业自建应用, that an app may hold at most 50 connections, and that delivery is clustered rather than broadcast, so one app identity effectively serves one connected client. Permissions, event subscriptions, and app publication are configured in the Feishu developer console.
- **企业微信** is a separate protocol and is not covered here.

Packaging constraint verified in this repository: `scripts/desktop-assembly.ts` packs each Mint package into a stage holding the frozen official runtime, and `verifyMintPackages` requires every declared `dependencies` and `peerDependencies` entry of a Mint package to resolve inside that stage. The official runtime closure is fixed upstream, so a Mint plugin cannot declare a third-party runtime dependency. Transport code is therefore either bundled into the plugin's build output or written against Node builtins.

## Scope

In:

- A channel capability seam: Service Definition, the WeChat provider, and a Consumer that binds a chat conversation to a Session in both directions.
- The seam is designed for additional platforms from the start, so the second provider tests the design instead of forcing a rewrite.
- A client settings section that guides connection setup, shows connection state, and manages authorization.
- Durable conversation bindings, sender authorization, outbound delivery state, and the Remote surface between the client page and the Host.
- A conversation-command surface for starting a new conversation, inspecting the current one, and stopping a running turn.
- Relay of a permission question to the conversation, so a task started from a phone can be answered from the phone.
- Mint product selection through the Mint Bundle, and the packaging changes that make the new packages part of the desktop assembly.

Out:

- The Feishu provider in this delivery. Its setup design is recorded here and built once WeChat validates the seam.
- Public-inbound webhook mode. It needs a public URL and contradicts the application's loopback posture.
- 企业微信, 公众号, and every unofficial WeChat protocol.
- A second long-running service. The connection runs inside the desktop backend process and stops when the application exits.
- Group conversations and rich inbound media.
- Any change to the Agent Loop, or any new model tool.

## Acceptance criteria

- [ ] AC-1: A user connects WeChat from the client by scanning one QR code, without leaving the application and without editing a configuration file.
- [ ] AC-2: A direct message received on the connected platform appears in a Session as a user message whose recorded source names the channel, conversation, sender, and platform message id, and the agent's final reply reaches that conversation.
- [ ] AC-3: An unauthorized sender is refused: no Session is created, no message becomes model-visible, and the refusal is diagnosable.
- [ ] AC-4: The client shows connection state, the bound workspace, agent preset and permission preset, the authorized senders, and a delivery state for each outbound reply.
- [ ] AC-5: A secret never returns to the client; the settings document and every client payload carry a credential reference only.
- [ ] AC-6: `/new`, `/status`, `/stop`, and `/help` work in a conversation with no Session, with an idle Session, and while a turn is running, and `/new` leaves the previous Session readable.
- [ ] AC-7: A command registered by any plugin is available in the conversation through the shared registry, while a message that is not a command never becomes one.
- [ ] AC-8: A permission question raised while the user is away from the desktop reaches the conversation and is answerable there by naming the question and its option, several questions may be pending at once, and an unanswered question stays fail-closed.
- [ ] AC-9: Disconnecting stops inbound polling and outbound delivery, releases the platform session, and leaves existing Sessions readable.
- [ ] AC-10: A generic Web composition excludes every Mint-only default; the `desktop-mint` Profile contains each selected row exactly once; a keyless browser scenario observes the setup flow and the connected state.
- [ ] AC-11: The packaged application resolves every Mint plugin dependency inside the assembly stage, and the packaged smoke test passes with the new packages present.

## Design and technical notes

### Ownership

| Concern | Owner |
|---|---|
| Channel capability: definition, providers, Session binding, conversation commands | new reusable packages under `packages/channel/` |
| Remote surface for the settings page | new controller under `packages/api/` |
| Setup and status interface | new client plugin under `packages/client/` |
| Product selection and defaults | `packages/bundle/desktop-mint/cordis.patch.yml` |
| Assembly and packaging | `MINT_PACKAGES` in `scripts/desktop-assembly.ts`, `scripts/build-mint-plugins.ts`, the packaged runtime-closure checks |

The capability is generic and configurable; Mint enables it and chooses product defaults. No shared package branches on Mint identity.

### Capability seam

`packages/channel/channel` declares the Service Definition and registers `ctx.channels`:

- `register(provider)` returns a disposer, following the registry convention that every registration is an effect.
- A provider declares an id, a display identity, an observable connection state, its inbound event source, and `send(conversation, message)`.
- Shared values are branded: `ChannelId`, `ChannelConversationId`, `ChannelUserId`, `ChannelMessageId`.
- `ChannelEventMap` is merge-extensible by provider kind, mirroring `WebhookEventMap`, so a provider adds its own event types without changing the definition package.

Providers:

- `packages/channel/channel-weixin` implements the iLink HTTP/JSON protocol: QR login, `get_qrcode_status` polling, the `get_updates` long poll with a durable cursor, `send_message`, and the media upload and download paths. Chunking, platform length limits, and the platform's anti-spam throttle policy live here.
- A second provider implements the same interface for another platform; the Feishu provider is the recorded second case.

Consumer:

- `packages/channel/channel-session` is the only component that creates or continues Sessions. Inbound it resolves the binding, creates a Session when none exists, and otherwise appends a user message and starts a turn. Outbound it observes the bound Session and delivers the reply. It also owns sender authorization, the conversation-command surface, delivery retry, and permission-question relay.

Controller:

- `packages/api/channel-controller` exposes `ctx.channelController` on the Host and `ctx.remote.channel` to the client: describe channels, begin and cancel a connection attempt, read a login attempt's progress, read and edit a binding, list and edit authorized senders, and list outbound delivery records.

### Conversation binding

One durable `ctx.storageDomain` domain holds a record per `(channel, conversationId)` carrying the workspace path, agent preset, permission preset, Session id, title, authorized sender ids, outbound display options, and the provider cursor where the provider needs one. The record is the only authority for which Session a conversation continues, and it is written before the first prompt is admitted so a crash cannot orphan a Session.

### Inbound path

1. The provider authenticates the delivery, normalizes it, and publishes it on the channel event.
2. The Consumer resolves the sender against the binding's authorized set. An unknown sender is refused: no Session, no model-visible message, one diagnostic log line, and an entry in the pending-request list the page renders.
3. A line matching the command syntax is handled by the conversation-command surface below and never reaches the model.
4. Any other accepted message becomes a `user/message` event carrying a new merge-extensible source, declared the way `webhook` declares its own:

```text
declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    channel: {
      readonly kind: 'channel'
      readonly channel: ChannelId
      readonly conversationId: ChannelConversationId
      readonly sender: ChannelUserId
      readonly messageId: ChannelMessageId
      readonly form: 'notice'
      readonly summary: string
    }
  }
}
```

5. Creating a Session follows the webhook runtime's transaction: validate the presets, resolve or create the Workspace, create the Agent with the Session working directory equal to the Workspace path, mount the agent preset before publication, attach the Session durably, then admit the follow-up.

### Conversation commands

A chat surface has no sidebar, so "start a new conversation" has to be expressible in words. DSH already owns the vocabulary: `ctx.commands` holds plugin-registered `/name` commands that run against an agent without becoming model messages, and the desktop composer's `/` menu is a view of that same registry. The conversation therefore exposes two tiers.

Tier 1 — conversation commands owned by `channel-session` and handled before any agent is resolved, so they work with no Session, with an idle Session, and while a turn runs:

| Command | Effect | Reply |
|---|---|---|
| `/new [title]` | Unbind the conversation; the next ordinary message creates a fresh Session, and an optional title names it explicitly | confirmation, including that the previous Session remains readable |
| `/status` | Report the conversation's current state | bound Session title, workspace, agent preset, permission preset, running or idle, last activity |
| `/stop` | Cancel the running turn through the session controller's cancel operation | acknowledgement, then the settled outcome |
| `/help` | List both tiers, labelling the conversation layer apart from the Session's plugins | the command list |
| `/whoami` | Report the sender's platform identity, for authorization and support | the platform user id |

Tier 2 — shared commands, dispatched through the existing registry against the bound Session's agent. Anything a plugin registers (`/compact`, `/plan`, `/goal`, `/export`, and future additions) becomes available in the conversation with no per-platform work, and the desktop composer keeps the same list.

Two rules keep the tiers coherent:

- A line is a command only when it matches the registry's syntax: a slash at byte zero, then a lowercase name of letters, digits, `_` or `-`, then end of input or whitespace. A well-formed command that neither tier knows is answered with a short hint pointing at `/help` and never becomes a model message, matching the existing adapter rule.
- A line that merely begins with a slash but does not match that syntax — `/加油` opening a Chinese sentence — is an ordinary message. The desktop composer can reject it because its `/` menu makes the intent unambiguous; a chat surface cannot, and swallowing ordinary text would be a worse failure than an accidental prompt.

### Outbound path

- The Consumer reacts to the bound Session's turn completion and sends the turn's final assistant text. The product owner decided that tool progress, intermediate assistant messages, and long-running notices are not sent; the platform's anti-spam behavior and the desktop notification precedent agree.
- Delivery is at-least-once with a bounded retry and a visible terminal failure. A dropped send is a reported state, never a silent one.
- The provider owns chunking, platform length limits, and format conversion; the Consumer owns the delivery record and its retry policy.

### Authorization and permissions

- The account that completes setup is the first authorized sender.
- The default posture denies every other sender. The page adds a sender by id or by approving a pending request.
- The binding's permission preset is chosen explicitly during setup, defaults to the standard preset, and stays visible in the connected state. A remote message runs the agent with tool access, so this is a presented choice rather than a silent default.
- A permission question raised by a bound Session is relayed to the conversation with the tool, the asker's reason, and the answers available, and is answered there. The answerer answers only for agents this conversation owns, matching the approval seam's ownership rule, and an unanswered question keeps its fail-closed outcome rather than opening the gate.

### Credentials

- The iLink token, and later the Feishu App Secret, are written through `ctx.credentials` and never return to the client; the settings document carries a reference.
- A WeChat QR login creates its own iLink bot identity, independent of any other client polling a different identity. The page states that one identity serves one connected client at a time, and the provider acquires its own token lock so a second instance fails loudly instead of silently splitting messages.

### Model-visible effect

Every model-visible input from a channel is a logged `user/message` event with its channel provenance, so the Session log reconstructs the conversation without the platform. Command runs are logged as `command/run` and `command/done` and stay out of model history. Outbound delivery state is not model-visible and lives in the delivery record rather than the Session log.

### Packaging

- Neither provider declares an external runtime dependency, because the assembly stage cannot resolve one.
- WeChat: implement against the documented HTTP/JSON API using Node builtins, with `node:crypto` covering the AES-128-ECB media path and with the official package and `cc-weixin` as protocol references.
- Feishu, later: bundling the official SDK into the packed plugin is the recommended path, because the SDK owns the long-connection framing, reconnection, and token refresh that would otherwise be owned code. The alternative is implementing the connection frames directly against Node's built-in WebSocket. The technical readiness record owns this choice and its cost.

### Plugin conformance

Every layer lands on an existing extension point; the only new one is the Service Definition the seam itself needs:

| Need | Extension point |
|---|---|
| Channel registry and provider interface | new `ctx.channels` Service Definition — the one new extension point, and the Service Definition role of the seam |
| Turning an accepted message into a turn | the public Session and Agent APIs the webhook runtime already uses |
| Observing turn completion | `ctx.on('session/event', …)`, the public event `session-title`, `token-meter`, `agent-instructions`, and `agent-team` already consume |
| Commands in the conversation | `ctx.commands`, the registry the desktop composer's `/` menu projects |
| Answering a permission question | the `approval/request` answerer waterfall, whose documented seat is a UI answerer answering for agents it owns |
| Conversation bindings | `ctx.storageDomain` |
| Secrets | `ctx.credentials` |
| Preferences and the settings page | `ctx.settingsScope` and the `settings.section` ledger |
| Interface composition | `ctx.slots` and the shared client primitives |
| Product copy | `ctx.locale.register` |
| Message provenance | `MessageSourceMap` declaration merging, as `webhook` already does |
| Client-to-Host calls | the existing Remote gateway and its forwarded owner events |

The Agent Loop is unchanged. The Mint Bundle carries patch rows only, with no feature implementation. No shared package branches on Mint identity, and a plain Web composition must run the seam without Mint defaults. Every registration goes through `ctx.effect` and returns a disposer, so disposing the provider aborts its long poll and releases its token lock.

Deployment-varying choices are validated `Config` fields, because a hardcoded tunable is not configurability: the default workspace path, the agent preset, the permission preset, the poll timeout and retry bounds, the circuit-breaker threshold, the outbound chunk length, and whether permission questions are relayed.

Three obligations remain before implementation:

- **External Session admission is not yet an extension point.** The transaction that turns an external trigger into a durable root Session lives inside the webhook runtime. This Consumer needs the same transaction, and duplicating a transaction whose attach-then-prompt ordering is subtle is what the extraction rule forbids. The conforming path defines the smallest reusable service and makes both the webhook runtime and this Consumer use it. Because that reaches an upstream-owned package, the technical readiness record chooses between extracting the service into a new package with the webhook migration as a follow-up, and including that migration in this delivery.
- **The feature record owes its reuse instructions and supported DSH version range**, as [reuse and compatibility](../../context/downstream-policy.md) requires: another DSH developer mounts `channel` with a provider of their own.
- **The seam's test plan belongs in this design**: unit tests per package, a real-composition test booting a test-only `cordis.yml` through the Loader, a keyless browser scenario for the settings flow, and the packaged assembly check.

## Client experience

### Entry point

A `settings.section` contribution named 远程连接 (Remote Connections), placed after Models. The navigation row and the section header carry an aggregate `StateDot`: neutral when nothing is configured, amber while connecting or waiting for a human action, green when a channel is connected, red on failure.

### Connection list

One card per platform, following the `ui-settings-plugins` card precedent of a name above a description rather than a `DisclosureRow`:

- not configured: platform name, one line naming what it enables, **连接**
- connecting: the current step and its state, **取消**
- connected: account identity, `StateDot`, a workspace and permission-preset summary, **管理**, **断开连接**
- unavailable: the Host diagnostic and **重试**

### WeChat setup

A `Modal` holding four steps, one visible at a time:

1. **扫码登录** — the QR rendered as an image from the URL the Host returns, the scan link as copyable text, and live state: 等待扫码 / 已扫码，等待确认 / 登录成功 / 二维码已过期，已刷新.
2. **确认身份** — the bot identity the login created, with a plain statement that this identity serves one client at a time.
3. **授权与运行位置** — authorized senders, defaulting to the scanning account; workspace, agent preset, and permission preset.
4. **完成** — the instruction to send the bot a message from WeChat, the few commands worth knowing (`/new`, `/status`, `/stop`, `/help`), and the most recent inbound and outbound event.

### Feishu setup (second delivery)

The same modal shell holding a five-step console walkthrough, because Feishu requires a self-built application:

1. **创建应用** — a control that opens the Feishu developer console, with a suggested application name to copy.
2. **凭证** — App ID and App Secret fields. The Host validates them against the Feishu API and reports success or the platform diagnostic inline.
3. **权限与事件** — the exact permission scopes and event names, each with a copy control, and deep links into that application's permission and event pages.
4. **发布应用** — what publishing means for a self-built application, with a deep link to the version page.
5. **连接验证** — the Host opens the long connection and the page shows the connected identity, followed by the same authorization and workspace step as WeChat.

Each step states its requirement and reports its own result; the flow never advances past an unverified step.

### In-conversation presentation

- An inbound message renders a source chip naming the channel and the sender, using the existing merge-extensible source projection in `ui-chat`.
- An outbound reply carries its delivery state — 发送中 / 已送达 / 发送失败 — because the user is away from the desktop when the reply is composed.
- A command run renders as the existing command conversation node, so `/new` in WeChat and `/compact` in the desktop composer read the same way.
- A permission question relayed to the conversation renders as a distinct card naming the tool and the asker's reason.
- A Session created by a channel names its origin in the session list, so a desktop user can tell which conversations are remote.

### Interaction states

- Loading: the page reads channel state from the Host; a channel whose provider is not mounted renders no row rather than a control that opens nothing.
- Empty: with no provider mounted the section is absent.
- Error: rejected credential, network failure, expired platform session (WeChat `errcode -14` requires a new scan), platform rate limiting, and failed delivery, each with its own message and remedy.
- Disabled: a channel whose provider reports unavailable, with the reason.
- Permission: the authorized-sender list and the pending-request list.

### Visual specification

- Color comes from the semantic theme roles only; the [design-system context](../../context/design-system.md) is the authority, and the feature introduces no literal color.
- Composition uses `Modal`, `Button`, `Input`, `StateDot`, `Tag`, `Toast`, `Tooltip`, and `MarkdownText`. The platform card and the step list are feature-local, following the `PluginCard` precedent.
- Status color follows the existing mapping: green for a confirmed connection, amber for pending human action, red for failure, neutral for unconfigured.
- Layout: a viewport-bounded modal with an approximately 560–640 px content frame, the QR at a fixed size inside a quiet frame, and steps stacked vertically with an index and exactly one primary action.
- Motion uses the shared 0.1, 0.2, and 0.3 second ease-in-out durations; the waiting state carries a `prefers-reduced-motion` static branch.
- Accessibility: the dialog has an accessible name, state changes announce through a live region, the QR image carries a text alternative, focus moves to the first control of each step, and icon-only actions carry labels.
- Copy is registered through `ctx.locale.register(ns, { zh, en })` and reaches the interface through the locale seat; `verify-client-ui-i18n` rejects hardcoded product text.

## Risks and open decisions

Resolved by the product owner on 2026-09-19:

1. **Product scope.** Approved: Desktop Mint distributes a selected feature set over the upstream Harness, the way a distribution relates to its upstream.
2. **First delivery.** WeChat first, because it needs one scan and no console work; other platforms follow once it validates.
3. **Outbound body.** The agent's final reply only.
4. **Conversation types.** Direct messages only.
5. **Session continuity.** One conversation continues one Session until the user starts a new one with a command.

Also resolved by the product owner on 2026-09-19:

6. **`/new` timing.** Unbinding now and creating the Session on the next message, so no empty Session is created.
7. **Whether conversation commands appear in the desktop composer.** They do not; the desktop keeps its sidebar and its stop control.
8. **Answering a relayed permission question.** The relayed message presents numbered options and the reply is that number.

Still open for the technical readiness record:

9. **Where external Session admission lives.** Extract the webhook runtime's Session-creation transaction into a reusable service and adopt it here, with the webhook migration either in this delivery or as a follow-up.

Risks:

- The long poll shares one process with the desktop backend, so an unbounded retry loop against a throttled platform degrades the whole application. The provider owns a bounded policy and a circuit breaker.
- A permission question relayed to a phone is answered by someone who cannot see the file or the command in front of them. The relayed card therefore names the tool and the asker's reason, and the unanswered default stays fail-closed.
- Bundling the Feishu SDK later grows the packed plugin. The assembly stage and the packaged smoke test must confirm the resolved closure and the artifact size.
- A remote conversation's permission preset is a real execution boundary. The design keeps it visible and refuses to choose it silently.

## Phasing

- Phase 1: the capability seam, `channel-session`, the WeChat provider, the conversation commands, permission-question relay, the controller, and the settings page with the WeChat flow.
- Phase 2: a second provider on the same seam, starting with Feishu and its console walkthrough.
- Phase 3: group conversations, produced-file attachments, and per-channel display options.
