# DSH Desktop Mint __VERSION__ — Unsigned Preview

This is an **unsigned preview for personal and small-group use** of the unofficial DSH Desktop distribution maintained by Mint. It follows the current DeepSeek Harness release but is not signed or notarized by Apple, and it is not endorsed, cooperated with, or authorized by DeepSeek.

## Download for your Mac

- Apple Silicon (M1, M2, M3, M4, or later): [DSH-Desktop-Mint-__VERSION__-arm64.dmg](https://github.com/mintgao/dsh-desktop/releases/download/desktop-v__VERSION__/DSH-Desktop-Mint-__VERSION__-arm64.dmg)
- Intel: [DSH-Desktop-Mint-__VERSION__-x64.dmg](https://github.com/mintgao/dsh-desktop/releases/download/desktop-v__VERSION__/DSH-Desktop-Mint-__VERSION__-x64.dmg)

## Install or update

1. Verify the DMG against `SHA256SUMS.txt`.
2. Quit DSH Desktop, open the DMG for your Mac, and drag **DSH Desktop** to **Applications**, replacing the previous copy when prompted.
3. Because this preview has no Apple Developer signature, macOS Gatekeeper may require an explicit **Open Anyway** confirmation in **System Settings > Privacy & Security**.
4. Treat identity-dependent native behavior, including task-completion notifications and automatic signed updates, as unavailable. Your ordinary `~/.dsh` settings, credentials, workspaces, and sessions stay outside the application bundle.

## Release information

- Desktop version: `__VERSION__`
- Embedded DeepSeek Harness: `__UPSTREAM_REF__` at `__UPSTREAM_COMMIT__`
- Desktop source commit: `__SOURCE_COMMIT__`
- Upstream changes: https://github.com/deepseek-ai/deepseek-harness/releases/tag/__UPSTREAM_REF__

This GitHub Pre-release contains only the two unsigned DMGs and their SHA-256 checksums. Install and replace it manually; it never enters the signed stable update feed.

---

这是由 Mint 维护、供个人与小范围使用的非官方 DSH Desktop **未签名预览版**。它跟随当前 DeepSeek Harness Release，但没有 Apple 签名或公证，也未获得 DeepSeek 的背书、合作或授权。

## 选择适合本机的下载

- Apple Silicon（M1、M2、M3、M4 或更新机型）：[DSH-Desktop-Mint-__VERSION__-arm64.dmg](https://github.com/mintgao/dsh-desktop/releases/download/desktop-v__VERSION__/DSH-Desktop-Mint-__VERSION__-arm64.dmg)
- Intel：[DSH-Desktop-Mint-__VERSION__-x64.dmg](https://github.com/mintgao/dsh-desktop/releases/download/desktop-v__VERSION__/DSH-Desktop-Mint-__VERSION__-x64.dmg)

安装前请用 `SHA256SUMS.txt` 校验 DMG，然后退出 DSH Desktop，打开对应 DMG 并把应用拖入**应用程序**。由于此预览版没有 Apple Developer 签名，macOS Gatekeeper 可能要求在**系统设置 > 隐私与安全性**中明确选择**仍要打开**。任务完成通知、自动签名更新等依赖稳定应用身份的原生行为不可用；普通 `~/.dsh` 设置、凭据、workspace 与会话不会随应用替换。

此 GitHub Pre-release 只包含两份未签名 DMG 及其 SHA-256 校验和，必须手工安装和替换，也不会进入签名稳定版更新源。
