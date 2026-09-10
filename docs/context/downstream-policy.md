# DSH downstream development policy

English | [中文](downstream-policy.zh.md)

## Purpose and scope

DSH Desktop Mint is a downstream desktop distribution of DeepSeek Harness. This policy governs existing functionality, fixes, experiments promoted into the product, and all future requirements. Its two approved product requirements are a desktop client and delivery of DSH updates that desktop users can discover, obtain, and apply. Any additional outcome needs an explicit scope decision; supporting infrastructure must name the requirement it serves.

## Plugin ownership

- Implement DSH behavior as independently configurable and disposable Cordis plugins through documented services, events, and UI slots. Reuse the DSH Agent runtime, session semantics, permissions, and Web client.
- Keep the Mint Bundle limited to plugin selection and product defaults. Keep branding, release channels, and distribution identity outside generic plugins. Shared packages must not branch on Mint identity.
- Native code owns application, window, menu, installer, updater, and backend-process lifecycle. It must not recreate Agent or Session policy. When DSH UI needs native privilege, expose a narrow typed capability with a replaceable provider; do not import Electron into a reusable Client plugin.
- When an extension point is missing, first define the smallest reusable DSH extension and implement the feature as its consumer. Record unavoidable upstream changes separately, with rationale, compatibility tests, and an upstream contribution or removal path.

## Reuse and compatibility

Every addition must identify a concrete benefit and delivery form for another DSH developer: an installable plugin or Bundle, a replaceable native adapter, or reusable build and release tooling. Native and release infrastructure are not required to pretend to be runtime plugins; they must separate reusable behavior from Mint configuration. Extraction is proportional to a real consumer need, not permission to build a general platform.

A feature record names its user outcome, owning package or native module, extension point, state and disposal owner, product configuration, permissions, model-visible effect, supported DSH versions, and reuse instructions. It records package and publisher identity accurately; a local workspace package is not evidence of public publication or external installation.

Shared functionality must pass an independent compatible DSH composition without Mint defaults. Distributable packages additionally need an external packed-install test without this repository's source aliases or workspace resolution. Compatibility claims name the exact tested versions or range, required providers, host/platform limits, data-format restrictions, and unsupported cases. An upstream developer-preview warning does not waive these obligations or imply arbitrary-version compatibility.

## Updates and user data

Upstream discovery, source adoption, qualified desktop publication, and user installation are separate outcomes. An available upstream release is not an installable desktop update. A successful workflow or release dispatch alone does not prove delivery.

End users receive one client update with one desktop version and installation choice, whether its changes concern DSH, plugins or desktop features. Default update UI describes user-visible improvements and required actions; it does not require users to distinguish or manage component versions. Exact component versions remain in release metadata for maintenance and diagnostics.

Each installable release identifies the desktop version, exact DSH source/version, included plugin versions, supported architecture, artifact integrity and trust status, and relevant data compatibility. Installation remains a user choice. Failure must leave a usable installed application or an explicit recovery path; replacing application files does not prove that an older runtime can safely read newer user data. No automatic data downgrade, silent destructive migration, or rollback claim is permitted without scenario evidence.

Update infrastructure must have a documented owner, bounded retry policy, visible blocking reason, and a tested resume procedure. Correctness and maintainability both count toward acceptance. Additional automation and permissions must remove an observed operational problem and retain a recoverable failure path.

## Review and acceptance

Review each change against its product requirement, plugin ownership, external reuse path, version compatibility, and assembled user scenario. Repository presence, unit tests, and configuration checks do not substitute for the relevant packaged-client, native-permission, or real upgrade scenario. Record unverified claims and blocking prerequisites explicitly. Existing deviations are tracked and assessed before related work expands them; this policy does not authorize an unrelated repository-wide rewrite.

## Rationale

The [downstream product-layer decision](../../.agents/notes/implemented/architecture/2026-08-25-downstream-client-product-layer.md) owns architectural rationale. The [desktop distribution review](../work-items/20260908-desktop-distribution-redesign/brief.md) owns the bounded review and update redesign; proposals there do not change running release policy until their migration is accepted and implemented.
