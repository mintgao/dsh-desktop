# Forward desktop update acceptance

English | [中文](brief.zh.md)

- ID: `20260911-desktop-update-path`
- Size: `L`
- Status: technical assessment

## Scope

The [approved scope](forward-baseline-scope.json) requires a usable current A and real A-to-B manual update, with compatibility beginning at A. Staged public preview follows prepublication qualification and exact payload authorization; public delivery is verified afterward. The [technical draft](forward-b-technical-draft.json) remains proposed.

## Technical decision readiness

- Outcome: `decision-required`
- Trigger evidence: executable-byte trust, installed application replacement, versioned publication evidence and recovery consistency
- Decision owner: /root/forward_b_decision
- Governing decision: none
- Review mode: `independent-agent`
- Review result: `changes-required`
- Review evidence: [independent review](forward-b-review.json)
- Material product decisions: [approved forward scope and publication order](forward-baseline-scope.json)
- Open blockers: concrete hosted GUI capability probe, ownership and alternatives, restored-A usability, accepted decision and approved review
- Gate: `blocked`
- Gate owner: /root
- Confirmed at: none
- Confirmation basis: none
- Readiness history: none

## Capability-probe readiness

- Outcome: `decision-accepted`
- Trigger evidence: native process ownership, credential isolation and GUI observation
- Decision owner: /root/forward_b_decision
- Governing decision: [accepted capability probe](../../decisions/20260913-forward-native-capability.md)
- Review mode: `independent-agent`
- Review result: `approved`
- Review evidence: [probe review](forward-probe-review.json)
- Material product decisions: [approved scope](forward-baseline-scope.json)
- Open blockers: none
- Gate: `implementation-ready`
- Gate owner: /root
- Confirmed at: 2026-09-13T01:04:10.840163+00:00
- Confirmation basis: accepted bounded probe decision and independent approval; [execution prerequisites](forward-probe-readiness.json) remain separate
- Readiness history: none
