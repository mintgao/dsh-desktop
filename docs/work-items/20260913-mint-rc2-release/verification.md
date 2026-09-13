# Verification: Mint RC.2 release

English | [中文](verification.zh.md)

## Source and platform acceptance

The independently verified seed `c1284f11471b429621bdfce141ba199bd4a9f7a7` passed lint, typecheck, build and 22,518 tests, with 129 tests skipped. Bot finalization changes only the source lock. Protected candidate `be4fb7f15508d0101e0a16ccbdff6730116af81c` includes the verified source; Linux CI and macOS packaging passed. Official alpha.2, RC.1 and RC.2 preserve persistence implementation and formats.

Actual npm 10 and npm 11.19 installations of the unchanged official lock verify 522 and 520 packages respectively. Every installed payload passes authenticated tarball comparison; altered optional payloads and missing selected packages reject. The official lock SHA256 remains `afa439f37a8b544b3884460a10634c6b474736958942aa4543ea048a95d348df`.

## Exact CI artifact upgrade

[Qualification run 34764279121](https://github.com/mintgao/dsh-desktop/actions/runs/34764279121), attempt 1, built and verified the unsigned arm64 DMG from the protected candidate. Independent native QA used the public alpha.2 unsigned.2 application, this exact CI application and its ordinary restart against fresh private synthetic data. Each phase persisted its own user message, assistant response and completed turn. Nine configuration/profile/workspace files remained identical; all three ordinary quits left no application or backend process.

After use, 25,460 backend entries and all 25,734 application entries remained verified. The CI application's asar SHA256 is `ac8ee9087164130323d34afe35312faa687506fefee7eebade9d0fe9054f2829`; its assembly receipt SHA256 is `c277db0f599e60a91a3a23677ef06790d0c4809ebf26f34b48965d0ef187718f`. This is exact-artifact synthetic upgrade evidence, not a claim about every user profile or external provider.

## Public release

[Desktop 0.1.5-rc.2.unsigned.1](https://github.com/mintgao/dsh-desktop/releases/tag/desktop-v0.1.5-rc.2.unsigned.1) was published at `2026-09-13T15:44:46Z` through [approved mutation run 34766075890](https://github.com/mintgao/dsh-desktop/actions/runs/34766075890). The immutable tag targets the qualified candidate. Control-record successor `7fbc26c4e57ec4806a5791b0c824f1502e0438a7` retains the same runtime and configuration and refreshes the independently validated activation binding.

The schema-2 manifest SHA256 is `168d4c2e3612dfbdbd5fac2e44bbebf7d6985b7d210723079556df1f6956bb87`. The arm64 DMG has 179,108,978 bytes and SHA256 `cdbc1adfb3928496812786d2d1df084fe986b82d281240230ccc99400d9be2a4`. The release has 11 assets. This remains an unsigned preview without notarization, signed automatic updates or identity-dependent native notifications.

## Installed-user evidence

Machine-specific backup, installed-client acceptance and cleanup records remain private. Follow [machine handoff](../../context/handoff.md) to preserve stopped data, verify the public artifact and check existing workspace, model selection and history after installation. Public qualification and synthetic tests do not establish a real provider connection or arbitrary user-data compatibility.
