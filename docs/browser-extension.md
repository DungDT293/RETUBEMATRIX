# RETubeMatrix Browser Extension (Chromium + Firefox)

Use the extension to send the current page to RETubeMatrix instantly, with media/quality options and queue control.

## Core Features

- **Floating button on supported sites** (YouTube, TikTok, Facebook, Instagram, X/Twitter, Vimeo, Twitch, Bilibili, Dailymotion, SoundCloud)
- **Popup action on any HTTP/HTTPS tab** (even when floating button is not shown)
- **Media mode selector**: `Video` or `Audio`
- **Quality selector**:
  - Video: `Best`, `8K`, `4K`, `2K`, `1080p`, `720p`, `480p`, `360p`
  - Audio: `Auto`, `128 kbps`
- **Two actions in one place**:
  - `Download now`
  - `Add to queue`
- **Floating controls**:
  - Collapse to a compact tab
  - Turn off completely
  - Re-enable from extension popup
- **Smart routing inside RETubeMatrix app**:
  - YouTube URL -> `YouTube` page
  - Other URL -> `Universal` page
- **YouTube watch URL normalization**: removes `list`/`index` when `v` exists to avoid unintended playlist enqueue
- **Duplicate-safe handling**: if URL already exists, app focuses the existing queue item instead of adding a duplicate

## How It Works

1. Extension builds a deep link:
   - `retubematrix://download?v=1&url=...&target=...&action=...&media=...&quality=...&source=...`
2. Browser asks to open RETubeMatrix (first time).
3. RETubeMatrix receives request and:
   - Adds URL to queue
   - Starts download immediately only when idle (`Download now`)
   - Keeps item queued when busy or when action is `Add to queue`

## Supported Sites for Floating Button

- `youtube.com`, `youtu.be`, `music.youtube.com`
- `tiktok.com`
- `instagram.com`
- `facebook.com`, `fb.watch`
- `x.com`, `twitter.com`
- `vimeo.com`
- `twitch.tv`, `clips.twitch.tv`
- `bilibili.com`, `b23.tv`
- `dailymotion.com`, `dai.ly`
- `soundcloud.com`

Popup sending works for all valid HTTP/HTTPS pages.

## Download Packages (Users)

| Browser                                                    | Download                                                                                                                      |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Chromium** (Chrome/Edge/Brave/Opera/Vivaldi/Arc/Coc Coc) | [Download .zip](https://github.com/DungDT293/RETUBEMATRIX/releases/latest/download/RETubeMatrix-Extension-Chromium.zip)       |
| **Firefox**                                                | [Download .xpi](https://github.com/DungDT293/RETUBEMATRIX/releases/latest/download/RETubeMatrix-Extension-Firefox-signed.xpi) |

## Install Guide

### Chromium (Chrome/Edge/Brave/Opera/Vivaldi/Arc/Coc Coc)

1. Extract `RETubeMatrix-Extension-Chromium.zip`.
2. Open `chrome://extensions` (or browser extension page).
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select the extracted folder.

### Firefox

1. Download `RETubeMatrix-Extension-Firefox-signed.xpi`.
2. Drag and drop the `.xpi` into Firefox (or open it directly).
3. Confirm installation.

## Prerequisites

- RETubeMatrix desktop app must be installed.
- Open RETubeMatrix at least once so OS registers `retubematrix://` protocol handler.

## Troubleshooting

- **“scheme does not have a registered handler”**
  - Open RETubeMatrix app once, then retry from extension.
- **Browser prompt closes quickly / app not opening**
  - Make sure RETubeMatrix is installed in standard location and protocol is registered.
  - Retry by clicking extension popup action.
- **Floating button is missing**
  - Check if site is in the supported allowlist.
  - Open extension popup and enable `Floating button`.
- **Still cannot send**
  - Copy URL in popup and test manual paste in RETubeMatrix to isolate site-specific issues.

## Developer Packaging

From repo root:

```bash
bun run ext:build
bun run ext:package
```

Outputs:

- Build folders:
  - `extensions/retubematrix-webext/dist/chromium`
  - `extensions/retubematrix-webext/dist/firefox`
- Packaged files:
  - `extensions/retubematrix-webext/dist/packages/RETubeMatrix-Extension-Chromium.zip`
  - `extensions/retubematrix-webext/dist/packages/RETubeMatrix-Extension-Firefox-unsigned.zip`

Signed Firefox `.xpi` is generated in CI release pipeline.
