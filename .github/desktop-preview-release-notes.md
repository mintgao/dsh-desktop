# DSH Desktop Mint __VERSION__

This is a **code-signed and notarized preview** of the unofficial DSH Desktop distribution maintained by Mint. It is built on DeepSeek Harness and is not endorsed, cooperated with, or authorized by DeepSeek.

## Download for your Mac

- Apple Silicon (M1, M2, M3, M4, or later): [DSH-Desktop-Mint-__VERSION__-arm64.dmg](https://github.com/mintgao/dsh-desktop/releases/download/desktop-v__VERSION__/DSH-Desktop-Mint-__VERSION__-arm64.dmg)
- Intel: [DSH-Desktop-Mint-__VERSION__-x64.dmg](https://github.com/mintgao/dsh-desktop/releases/download/desktop-v__VERSION__/DSH-Desktop-Mint-__VERSION__-x64.dmg)

## Install or update

1. Quit DSH Desktop.
2. Open the DMG for your Mac and drag **DSH Desktop** to **Applications**, replacing the previous copy when prompted.
3. Open DSH Desktop. Stop if macOS cannot verify its Developer ID signature or notarization ticket.
4. Your ordinary `~/.dsh` settings, credentials, workspaces, and sessions stay outside the application bundle.

## Release information

- Desktop version: `__VERSION__`
- Embedded DeepSeek Harness: document the adopted upstream tag or commit before publishing
- Changes: replace this line before publishing
- Known limitations or migrations: replace this line before publishing

`SHA256SUMS.txt` contains the checksums for both DMGs. This preview checks GitHub Releases for newer desktop versions, but it never downloads or installs an update itself. The application will identify the recommended DMG and open the exact Release page after you choose to continue.

---

这是由 Mint 维护的非官方 DSH Desktop **已签名并公证的预览版**，基于 DeepSeek Harness 构建，未获得 DeepSeek 的背书、合作或授权。

## 选择适合本机的下载

- Apple Silicon（M1、M2、M3、M4 或更新机型）：[DSH-Desktop-Mint-__VERSION__-arm64.dmg](https://github.com/mintgao/dsh-desktop/releases/download/desktop-v__VERSION__/DSH-Desktop-Mint-__VERSION__-arm64.dmg)
- Intel：[DSH-Desktop-Mint-__VERSION__-x64.dmg](https://github.com/mintgao/dsh-desktop/releases/download/desktop-v__VERSION__/DSH-Desktop-Mint-__VERSION__-x64.dmg)

安装更新前请退出 DSH Desktop，打开对应 DMG，把 **DSH Desktop** 拖入**应用程序**并替换旧版本。打开应用时，如果 macOS 无法验证 Developer ID 签名或公证票据，请停止使用该下载。应用外的普通 `~/.dsh` 设置、凭据、workspace 与会话不会被替换。

发布前必须补齐上方 Release information 中的内置 Harness 修订、变更与迁移说明。本预览版只会提醒并引导用户打开确切 Release 页面，不会自行下载或安装更新。
