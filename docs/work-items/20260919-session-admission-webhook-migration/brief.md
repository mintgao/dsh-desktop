# Migrate the webhook runtime onto session admission

English | [中文](brief.zh.md)

- ID: `20260919-session-admission-webhook-migration`
- Size: `M`
- Status: shaping
- Created: 2026-09-19

## Technical decision readiness

- Outcome: `not-assessed`
- Trigger evidence: none
- Decision owner: none
- Governing decision: none
- No-new-decision rationale: none
- Review mode: `not-required`
- Review result: `not-required`
- Review evidence: none
- Material product decisions: none
- Open blockers: none
- Gate: `blocked`
- Gate owner: Workflow orchestrator
- Confirmed at: none
- Confirmation basis: none
- Readiness history: created on 2026-09-19 to bound the duplication window that the [remote channel connections decision](../../decisions/0001-remote-channel-connections.md) accepts; no trigger scan has run and no code has been edited

## Goal

The webhook runtime stops owning the only implementation of the transaction that turns an external trigger into a durable root Session, and uses the shared service instead, so one ordering has one implementation.

## Context

The [decision record](../../decisions/0001-remote-channel-connections.md) chose option (b) in its second section: extract the smallest reusable service, adopt it in the channel consumer immediately, and migrate the webhook runtime separately. This work item is that migration, and it is what bounds the duplication window the record accepts.

- The service: `packages/session/session-admission`.
- The duplicate: the local transaction in [`packages/webhook/webhook/src/session.ts`](../../../packages/webhook/webhook/src/session.ts).
- The cross-package suite the record requires: it drives both the service and this runtime against the same ordering assertions.

## Scope

In:

- Deleting the webhook runtime's local transaction and calling the service.
- Keeping every observable webhook behavior identical: the session-id brand prefix, request validation errors and their field names, preset resolution order and standing-key resolution, Workspace resolve-or-create semantics, the model-selection inheritance rule, title and permission-preset application before admission, `source.kind: 'webhook'` provenance, the abort signal honored through publication, and the detach-then-dispose order.

Out:

- Any behavior change, any new product surface, and any change to the webhook rule or delivery model.
- The channel feature itself; it consumes the service from its first delivery.

## Acceptance criteria

- [ ] AC-1: The webhook runtime contains no local copy of the transaction and calls the shared service.
- [ ] AC-2: A test drives the migrated runtime and asserts every item in the decision record's non-regression list.
- [ ] AC-3: The cross-package suite drives both the service and the migrated runtime against the same ordering assertions, so drift in either is detected.
- [ ] AC-4: No user-visible or model-visible behavior changes; the recorded-session snapshots that cover webhook Sessions are unchanged.
- [ ] AC-5: The change reaches upstream through the contribution or removal path the [downstream policy](../../context/downstream-policy.md) requires, or records why it does not.

## Design and technical notes

The service contract is the second section of the [decision record](../../decisions/0001-remote-channel-connections.md). The migration passes the session-id brand prefix, the follow-up source, and the error-message subject as parameters, because the record requires webhook provenance and validation messages to stay byte-identical.

## Risks and open decisions

- The webhook package is upstream-owned, so landing depends on upstream review. Until it lands, two implementations exist, and the cross-package suite is the only thing keeping them aligned.
- The session-id brand prefix and the error subject must stay parameters rather than becoming constants; a constant would change how existing webhook Sessions are identified in the log.
