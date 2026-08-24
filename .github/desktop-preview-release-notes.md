# DSH Desktop Mint __VERSION__

This is an **unsigned preview** of the unofficial DSH Desktop distribution maintained by Mint. It is built on DeepSeek Harness and is not endorsed, cooperated with, or authorized by DeepSeek.

## Download for your Mac

- Apple Silicon (M1, M2, M3, M4, or later): [DSH-Desktop-Mint-__VERSION__-arm64.dmg](https://github.com/mintgao/dsh-desktop/releases/download/desktop-v__VERSION__/DSH-Desktop-Mint-__VERSION__-arm64.dmg)
- Intel: [DSH-Desktop-Mint-__VERSION__-x64.dmg](https://github.com/mintgao/dsh-desktop/releases/download/desktop-v__VERSION__/DSH-Desktop-Mint-__VERSION__-x64.dmg)

## Install or update

1. Quit DSH Desktop.
2. Open the DMG for your Mac and drag **DSH Desktop** to **Applications**, replacing the previous copy when prompted.
3. Because this preview is not signed or notarized, macOS may block its first launch. In **System Settings > Privacy & Security**, confirm that you trust this release before choosing **Open Anyway**. Never bypass the warning for a download whose tag, filename, and checksum do not match this page.
4. Open DSH Desktop. Your ordinary `~/.dsh` settings, credentials, workspaces, and sessions stay outside the application bundle.

See [Apple's guidance for safely opening Mac apps](https://support.apple.com/guide/mac-help/open-a-mac-app-from-an-unidentified-developer-mh40616/mac) for the current macOS steps.

## Release information

- Desktop version: `__VERSION__`
- Embedded DeepSeek Harness: document the adopted upstream tag or commit before publishing
- Changes: replace this line before publishing
- Known limitations or migrations: replace this line before publishing

`SHA256SUMS.txt` contains the checksums for both DMGs. This preview checks GitHub Releases for newer desktop versions, but it never downloads or installs an update itself. The application will identify the recommended DMG and open the exact Release page after you choose to continue.

---

这是由 Mint 维护的非官方 DSH Desktop **未签名预览版**，基于 DeepSeek Harness 构建，未获得 DeepSeek 的背书、合作或授权。

## 选择适合本机的下载

- Apple Silicon（M1、M2、M3、M4 或更新机型）：[DSH-Desktop-Mint-__VERSION__-arm64.dmg](https://github.com/mintgao/dsh-desktop/releases/download/desktop-v__VERSION__/DSH-Desktop-Mint-__VERSION__-arm64.dmg)
- Intel：[DSH-Desktop-Mint-__VERSION__-x64.dmg](https://github.com/mintgao/dsh-desktop/releases/download/desktop-v__VERSION__/DSH-Desktop-Mint-__VERSION__-x64.dmg)

安装更新前请退出 DSH Desktop，打开对应 DMG，把 **DSH Desktop** 拖入**应用程序**并替换旧版本。由于预览版未经签名或公证，macOS 可能阻止首次启动；请先核对本页标签、文件名与 `SHA256SUMS.txt`，仅在确认信任此版本后，前往**系统设置 > 隐私与安全性**选择**仍要打开**。应用外的普通 `~/.dsh` 设置、凭据、workspace 与会话不会被替换。

发布前必须补齐上方 Release information 中的内置 Harness 修订、变更与迁移说明。本预览版只会提醒并引导用户打开确切 Release 页面，不会自行下载或安装更新。
