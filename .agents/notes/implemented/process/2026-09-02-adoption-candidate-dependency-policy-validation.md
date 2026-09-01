# Agent Note: Adoption candidate dependency-policy validation

Status: implemented

English | [中文](2026-09-02-adoption-candidate-dependency-policy-validation.zh.md)

## Problem

A downstream-only package can remain mergeable when an upstream release changes repository dependency policy. Desktop tests, builds, type checking, and documentation checks do not prove that every retained package manifest follows the current publication layout, so a qualified desktop candidate could publish successfully while the next ordinary pull request fails `Release (dsh)` and generates an unrelated failure notification.

## Decision

The transactional upstream-adoption candidate job runs `verify-package-dependencies` immediately after its frozen dependency install and before desktop tests, builds, or native packaging. A stale retained package manifest therefore blocks qualification before the State Finalizer can create the desktop tag or advance the release phase.

Downstream-owned Client packages follow [published dependency faces](2026-08-26-published-dependency-faces.md): Cordis remains a matching peer and development dependency, while Client imports, type relationships, injection metadata, and invariant companions remain development-only. The focused workflow test requires the dependency-policy command in candidate validation, and `Release (dsh)` retains the same check as a second defense for ordinary repository changes.

## Verification

`verify-package-dependencies` validates the retained manifests without built artifacts. The desktop workflow spec pins the candidate command, and its focused suite verifies the workflow definition without invoking publication.

## Alternatives considered

**Rely on `Release (dsh)`.** That workflow detects the manifest defect on later pull requests or `main` pushes, after the adoption candidate may already have produced a public desktop Release.

**Run the complete npm release workflow during adoption.** Candidate qualification needs the deterministic dependency-section check, not the unrelated packaging and publication jobs or their repository guards.

**Exempt downstream-only Client packages.** They ship inside the same repository and publication graph, so exempting them would make the installed dependency layout depend on package origin rather than the current artifact contract.

## Consequences

Candidate validation performs one additional source-only check. Upstream policy migrations that affect retained Mint packages require an explicit manifest adaptation in the adoption pull request, and the failure appears on that review surface instead of on a later unrelated pull request.
