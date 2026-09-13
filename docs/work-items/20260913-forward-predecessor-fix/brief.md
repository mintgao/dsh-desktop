# Published forward manifest as catch-up predecessor

English | [中文](brief.zh.md)

## Scope and evidence

Size: S, bounded reader consistency fix within the accepted release contract. The actual public alpha.2 unsigned.2 manifest uses schema 3. RC.2 adoption planning rejects that downloaded manifest because the catch-up baseline reader only accepts schemas 1 and 2. Publication and manifest validators already accept schema 3. The [accepted forward decision](../../decisions/20260913-observed-forward-delivery.md) defines schema 3 as a final publication manifest; no new format, authority, runtime or migration semantics are proposed.

## Technical readiness

Extend only the supported final-manifest schema enumeration in the catch-up baseline reader. Preserve exact public tip, repository/distribution/mode, downloaded JSON and immutable tag identity checks. Tests accept published schema 3 and historical schemas 1/2, and reject unknown schemas, build receipts, shadow mode, changed downloads and moved tags. Independent Tech Lead approved this scope against the accepted forward decision. Require numeric schemas 1/2/3 and reject string schemas. Gate owner: root; implementation-ready. Root is the sole implementation writer; QA remains independent. The host cannot resume the prior RD specialist, so root uses the sequential RD fallback.

## Delivery

Merge this tooling correction through the ordinary protected-main PR process before trusted bot finalization of the RC.2 source adoption. It changes no source-lock or published artifact. Re-plan the RC.2 adoption against the updated protected base and retain source ancestry. User publication authorization includes this necessary repair; no protection bypass is permitted.
