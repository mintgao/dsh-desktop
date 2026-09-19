# Agent Note: Remote channel connections over instant-messaging platforms

Status: proposed

English | [中文](2026-09-19-remote-channel-connections.zh.md)

## Problem

The desktop client binds an agent to the machine it runs on. A user who wants to start a task, answer a permission question, or read a result has to be at that machine, and the product has no surface a phone can reach.

Two instant-messaging platforms can carry that surface without a public endpoint. The WeChat iLink bot API is an HTTP long poll the client drives itself, and Feishu's long connection is a WebSocket the client opens. Neither needs inbound reachability, which is what makes either usable from a desktop application behind a home router.

What the client must not do is grow a per-platform copy of work that already exists once: turning an external trigger into a durable Session, authorizing a sender, dispatching a command, and relaying a permission question. The upstream webhook ingress holds the only implementation of the admission transaction, it is upstream-owned, and a second implementation of that ordering would be a second place to get the subtle parts wrong.

## Proposal

Deliver the capability as a complete capability seam: a Service Definition in `packages/channel/channel` that declares `ctx.channels`, one Service Provider per platform, and one Consumer that admits inbound messages into Sessions. The durable contracts — the registry interface, the admission extraction, binding durability, provenance, delivery, commands, the permission relay, transport constraints, packaging, recovery, and per-package ownership — are decided in [the decision record](../../../../docs/decisions/0001-remote-channel-connections.md). This note carries why the seam is shaped that way and what it gave up.

Phase 1 delivers the seam, `channel-session`, the WeChat provider, the conversation commands, the permission relay, the Remote controller, and the client settings section. Phase 2 adds Feishu behind the same interface; its packaging choice is deferred to its own readiness record.

### Seam topology

`ctx.channels` is one registry rather than one service per platform, because a Consumer that enumerates providers needs a single enumeration point and must not branch on platform identity. A provider authenticates and normalizes before it publishes, so platform-raw bytes never reach the Consumer and a parsing bug cannot become a Session.

The Consumer is one package, not one per platform: binding, sender authorization, the pending-request records, the two command tiers, delivery records, and the permission relay are platform-independent, and keeping them in one place is what makes a second platform cheap.

The client surface is one settings section projected through a Remote controller, and providers go through it rather than shipping their own page.

### Admission extraction

`packages/webhook/webhook/src/session.ts` holds the only implementation of the transaction that turns an external trigger into a durable root Session, including its ordering and its rollback. The delivery extracts the smallest reusable service into `packages/session/session-admission`, which owns that transaction and nothing else; `channel-session` adopts it from the start, and the upstream webhook migrates in a separate work item whose landing depends on upstream review.

The duplication window that leaves open is the cost. A cross-package parity suite bounds it by driving the unchanged upstream transaction and the extracted service against the same assertions, so a divergence fails a test rather than a user's conversation.

### Configuration

Every deployment-varying value is a validated `Config` field changeable from `cordis.yml`: poll and retry bounds, backoff, the throttle policy, the circuit-breaker threshold, chunking limits, and the retention of delivery records. Protocol constants, platform length limits, and security invariants stay fixed in the provider. The Mint bundle carries patch rows only and enables the seam with product defaults; a plain Web composition boots the same seam without them.

## Alternatives considered

**One service per platform (`ctx.channelWeixin`), discovered by convention.** Rejected: no single enumeration point, the Consumer branches on platform identity, and a second provider means a second contract.

**Reuse `ctx.webhook` with a channel provider kind.** Rejected: the webhook ingress fits a one-shot delivery-to-Session trigger, not a connection lifecycle, an outbound send, and a per-conversation binding; it is also upstream-owned code.

**Publish platform-raw inbound events and authenticate in the Consumer.** Rejected: it moves per-platform verification into shared code and turns a parsing bug into a Session.

**Have each provider own its own admission call.** Rejected: it duplicates an ordering that is subtle exactly where it is easy to get wrong, and its failure mode is a leaked live Agent.

**Fork the admission transaction inside the delivery instead of extracting it.** Rejected for the same reason, and it would diverge from the upstream implementation with nothing to detect the drift.

**Wait for upstream to expose the admission transaction before starting.** Rejected: it couples the feature's schedule to upstream review for a change with no webhook-visible effect.

**Give each provider its own client page.** Rejected: it multiplies the surface a second platform must build and keeps the settings experience from converging.

**Reuse the `webhook` member of `MessageSourceMap` with a channel-shaped payload.** Rejected: it would misstate `deliveryId` and `ruleId` or widen them for every consumer, while the desktop's source projection needs exactly the channel fields to render the chip.

**Queue concurrent permission questions in one conversation.** Rejected by the product owner: a question that falls through unanswered settles `unavailable` and denies, failing a task the user never saw.

**Set an explicit title on a conversation-created Session.** Rejected: it would make remote Sessions diverge from desktop ones, which the composition's title capability already names from the first message.

**Ship Feishu in the same phase as WeChat.** Deferred, not rejected: WeChat's protocol is the smaller one to verify, and the seam is what makes the second platform cheap once the first is proven.

## Acceptance criteria

The observable state that means done is the accepted brief's AC-1..AC-11 at [docs/work-items/20260919-remote-channel-connections/brief.md](../../../../docs/work-items/20260919-remote-channel-connections/brief.md); this note adds no criteria of its own. The gates the delivery must clear are recorded there and in the decision record's packaging section: the assembly's runtime-closure check, the packaged smoke test, the keyless browser scenario, the cross-package parity suite, and the top-level documentation, typecheck, and coverage gates.

## Risks

**Two admission implementations until the migration lands.** The parity suite is the only thing keeping them aligned, and a platform-specific divergence it does not assert would reach users.

**A crash between two adjacent durable writes orphans one Session.** It stays attached to the Workspace, readable from the desktop, and unreachable from the conversation. No primitive spans the Workspace registry and the storage domain in one transaction, so the window is accepted rather than closed.

**The token lock is machine-local.** One identity serves one connected client per machine, and a second machine polling the same identity splits messages with no lock to stop it; the platform is the only enforcement point there.

**A relayed permission question is a real execution boundary.** A conversation's permission preset is chosen explicitly at setup and stays visible, and silence fails closed to denial, so an unanswered question can fail a task.

**Duplicated replies are possible.** At-least-once delivery is the deliberate choice, because a lost reply is worse than a repeated one.

**Platform sessions expire.** A WeChat session the platform has invalidated requires a new scan, and no retry policy resurrects it.
