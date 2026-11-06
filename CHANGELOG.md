# Changelog

All notable changes to RETubeMatrix will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **RETubeMatrix brand migration** - Updater now targets `DungDT293/RETUBEMATRIX`; deep links use `retubematrix://` (legacy `youwee://` still accepted); CLI shim, browser extension and SDK renamed to `retubematrix`.
- **Plugin runtime env prefix** - Added `RETUBEMATRIX_*` environment variables with `YOUWEE_*` compatibility aliases for existing plugins.

### Removed

- **Dead feature cleanup** - Removed unreachable Download, Gallery, Metadata, Processing, Subtitles and Summary pages, the gallery/metadata/processing Rust modules, and 32 unused `browser_engine` Python modules.

## [0.20.15] - 2026-11-05

### Added

- **100% Zero-Touch Auto-Pilot Pipeline** - Implemented complete 1-click end-to-end automation from Lv1 Reup -> AI Title (95/5 word boundary) & 3-tier Description -> Companion Thumbnail auto-injection -> BKT Test Upload (unlisted) -> Adaptive Studio Restrictions Polling (up to 25 attempts / 10-12 mins) -> Auto-Publish to Official Channel upon `green_clean` verification
- **Companion Thumbnail (.jpg) Auto-Extraction** - Added `--write-thumbnail --convert-thumbnails jpg` to `download.rs` so yt-dlp preserves standalone `.jpg` files alongside downloaded videos for automated YouTube Studio uploads
- **Adaptive YouTube Studio Restrictions Polling** - Overhauled Studio copyright polling to support up to 25 retry cycles (25s interval, totaling 10-12 minutes) tracking YouTube's multi-stage processing ("Processing SD/HD..." -> "Checks in progress..." -> "None / Copyright claim") without false positives or premature timeouts
- **Library Direct Action to Reup & BKT** - Added "🚀 Đưa vào Reup & Test BKT" shortcut to downloaded history items, automatically loading video and companion thumbnail into Reup
- **URL Protection for Reup Pipeline** - Added URL guard in Reup page preventing FFmpeg crashes from raw YouTube URLs and providing a 1-click "Download to PC" button

### Fixed

- **AI Title 95/5 Word Boundary & Dynamic CTR (TC-25)** - Replaced mechanical character truncation with syllable-safe Vietnamese word-boundary title slicing, integrated 25+ curated hook templates across 5 styles (curiosity, secret, urgency, value, CTA), dynamic CTR estimation (+15% to +49%), seed rotation, and 1-click apply to active BKT/Main Channel
- **Subtitles (CC) Downloader Configuration (TC-29)** - Added Subtitles button, popover, mode/lang/embed/format settings to Clean Downloader and wired into `download_video`
- **Channel Pretty Name & Gradient Avatar Fallback (TC-09)** - Auto-prettifies `@Handle` and URL formats upon adding channels; provides elegant gradient Initials Avatar fallback when thumbnail is unavailable
- **i18n BKT Error Keys (TC-36)** - Added missing `bktLoginRequired`, `bktTimeout`, `bktQuotaExceeded` across all 10 non-primary languages
- **Accessibility & Refresh Button (TC-34)** - Added `aria-label` and `title` to yt-dlp refresh button in `DependenciesSection.tsx`
- **Tester Guide Storage Fallback & Test Suite Expansion** - Fixed recursive call bug in `safeStorage` in `TESTER_GUIDE_RETUBEMATRIX.html` and expanded test matrix to 44 cases

## [0.20.14] - 2026-11-04

### Fixed

- **Window Arranger Multi-Row Auto-Clamping (TC-06)** - Fixed arithmetic overflow when arranging windows in multi-row grid layouts (such as "2 columns"). Window width and height are now clamped dynamically (`max_h = (screen_h - (rows - 1) * gap) // rows`), ensuring all profile windows remain 100% within the visible screen area without overflowing downward into the void. Passed `columns` and `gap` parameters from `runner.py`
- **Outlier Hunter to Test BKT Data Transmission (TC-17)** - Fixed missing path synchronization when clicking "Test BKT" on an outlier candidate card. Both video title and URL/path are now saved to `sessionStorage` and automatically populated into Tab 1 (`inputVideoPath`) and Tab 2 (`uploadVideoPath` and `uploadTitle`) of the Reup & BKT interface
- **AI Thumbnail Export Canvas Rendering & File Download (TC-26)** - Implemented full HTML5 Canvas off-screen rendering with visual filter transforms (contrast, brightness, saturation, anti-hash zoom scale, color tint modes). Generates a valid PNG blob and automatically triggers direct file download to disk (`optimized_thumbnail_<timestamp>.png`)
- **Universal Downloader 500ms Debounce Video Pre-fetch (TC-27)** - Added 500ms debounced URL pre-fetch with `VideoPreview` in `UniversalUrlInput.tsx`, displaying video title, thumbnail, duration, and resolution badge before adding to the queue
- **NSIS Installer Upgrade & Locked File Handling** - Enhanced `template.nsi` to terminate all application child processes (`RETubeMatrix.exe`, `retubematrix-yt-dlp.exe`, `browsermulti.exe`, `python.exe`, `msedgewebview2.exe`) and execute background uninstalls silently, preventing the "Unable to uninstall!" dialog during version upgrades
- **Tester Guide Storage Fallback for file:// Protocol** - Implemented `safeStorage` in `TESTER_GUIDE_RETUBEMATRIX.html` to gracefully fallback to memory storage when browsers restrict `localStorage` under `file:///` URLs, ensuring all buttons, filters, and note inputs remain interactive

## [0.20.13] - 2026-11-04

### Fixed

- **Window Arranger Pure Win32 Fallback & Path Resolution** - Eliminated dependency on `win32gui` and `win32process` (`pywin32`) by implementing a pure Windows standard-library `ctypes` window enumeration engine. Added desktop enumeration with `OpenInputDesktop` and resolved full profile data directories (`profile_data_dir`), fixing the "Không tìm thấy cửa sổ Chromium đúng hồ sơ để sắp xếp" issue
- **BKT YouTube Channel Selection & Verification** - Overhauled `ensure_preferred_youtube_channel` with loose normalization (`_normalize_clean`) matching handles without `@` prefix, channel names, URLs, and case/whitespace variations. Added top-level active account header check (`ytd-active-account-header-renderer`) for immediate single-channel detection without requiring switcher submenus
- **Zombie Process Filter & Background UI Polling** - Filtered out `--type=` child helper processes from `chrome_pids_by_user_data_dir` so only root Chromium browser instances determine active status. Added an automatic 4-second background UI polling loop in `ProfilesPage.tsx` to sync status when browser windows are closed externally
- **YouTube Studio Multilingual Selector Support** - Expanded `upload_actions.py` to support both Vietnamese and English UI buttons ("Create" / "Tạo", "Upload videos" / "Tải video lên", and icon selectors)

## [0.20.12] - 2026-11-04

### Fixed

- **NSIS Installer Auto-Process Termination On Upgrade** - Resolved installer popup `[!] Unable to uninstall!` when upgrading an existing installation. Integrated automatic process termination for `RETubeMatrix.exe`, `retubematrix-yt-dlp.exe`, and `browsermulti.exe` in `template.nsi` before running the uninstaller or overwriting files, allowing smooth unattended upgrades
- **Tester Guide Lifecycle & Race-Condition Immunity** - Fixed `TESTER_GUIDE_RETUBEMATRIX.html` initialization to guarantee instant activation under both `file://` protocol and offline environments via `document.readyState` detection, preventing unclickable UI controls

### Added

- **Exhaustive Multi-Agent Tested QA Matrix** - Expanded `TESTER_GUIDE_RETUBEMATRIX.html` with comprehensive button-by-button, input-by-input verification cases across all 9 core functional modules and hotfixes, complete with direct offline usage instructions

## [0.20.11] - 2026-11-04

### Fixed

- **Chromium Launch & Profile Management Deadlock Elimination** - Resolved race condition where frequent UI status polling (`action_list_profiles`) prematurely terminated launching browser instances before their main windows were rendered. Replaced destructive process termination on read-only queries with safe PID existence inspection (`psutil.pid_exists`)
- **Recursive Process Tree Cleanup** - Updated `_clean_profile_locks` to recursively kill all child processes (`proc.children(recursive=True)`), preventing orphaned helper processes (`BrowserMulti` utility, GPU, renderer) from lingering in Task Manager
- **Self-Healing Session Initialization** - Enhanced `session.start` in `browser.py` to automatically purge orphan background Chromium helper processes lacking a top-level window instead of aborting with a blocking `RuntimeError`
- **Safe Process Enumeration** - Handled Windows `psutil.AccessDenied` and `psutil.NoSuchProcess` exceptions in `chrome_pids_by_user_data_dir` and added explicit recognition for `browsermulti` process names
- **Seamless Legacy Database Data Migration** - Automatically migrated legacy `youwee.db` records (`bkt_test_channels`, `followed_channels`, `channel_videos`, `outlier_videos`) directly into `retubematrix.db` on first boot

### Added

- **Exhaustive Interactive Tester Dashboard** - Completely updated `TESTER_GUIDE_RETUBEMATRIX.html` with 40 granular test cases across all 9 core functional modules, featuring specific UI targets (`targetElement`), 1-click sample payload copying (`samplePayload`), and failure warnings

## [0.20.10] - 2026-11-04

### Added

- **Visible Browser Window Detection** - Added Win32 `EnumWindows` and `IsWindowVisible` verification (`has_profile_windows`) to accurately detect real-time user-facing Chromium browser sessions instead of relying solely on background PID existence

### Fixed

- **False "Running" Profile Status** - Resolved issue where closed profiles lingered in "Đang chạy" (running) status due to orphan Chromium background helper processes (crashpad, utility, gpu). The system now automatically purges stale locks (`SingletonLock`, `lockfile`, `browsermulti_session.pid`) and terminates orphan PIDs on profile listing, correctly restoring status to stopped
- **YouTube Studio and Test Channel Multi-window Startup** - Prevented lock contention when opening test channels and profile manager instances simultaneously, ensuring smooth startup and instant window focus

### Changed

- **Complete Brand Migration to RETubeMatrix** - Fully rebranded desktop application binaries (`RETubeMatrix.exe`), download helper (`retubematrix-yt-dlp.exe`), deep link protocol handler (`retubematrix://`), local storage keys, and documentation across all 13 supported languages


## [0.20.9] - 2026-11-04

### Added

- **One-click Scan All Ikigai Niches** - Added "⚡ Quét Toàn Bộ Ngách Ngon" button to automatically scan across all 7 high-potential Ikigai niche clusters simultaneously
- **Outlier Niche Filter Pills** - Introduced dynamic filter pills to quickly view discovered breakout videos grouped by niche or across all niches
- **Dedicated External Browser Opener** - Added custom Tauri command `open_external_url` utilizing Windows ShellExecute (`rundll32 url.dll,FileProtocolHandler`) to seamlessly launch URLs in the user's default browser (Google Chrome, Edge, Firefox)
- **Global Link Interceptor** - Implemented application-wide external link capture in `App.tsx` ensuring all video links, channel URLs, and external resources redirect out of WebView into the external browser

### Fixed

- **YouTube publish time formatting** - Converted raw hour display (e.g. `48940h trước`) into human-readable YouTube standard relative format (days, weeks, months, years ago) with full timestamp tooltip on hover
- **Outlier Hunter and Competitor "Xem" buttons** - Fixed video viewing buttons across Outlier Hunter cards, Competitor channel analysis, and Google Trends launcher that previously got trapped in internal WebView tabs
- **Evergreen niche filtering** - Relaxed overly strict view count, duration, and VPH filters in SQLite database and Python engine so evergreen breakout music and long-form vlogs are correctly discovered

## [0.20.8] - 2026-11-03

### Added

- **Ikigai-based Outlier Breakout Hunter** - Completely rebuilt Feature 5 around the Japanese Ikigai model (Viewer Demand, Creator Sustainability, Monetization Potential) with 3 strategic niche groups and custom niche targeting
- **4 Real-time Niche Validation Tools** - Added YouTube Alphabet Autosuggest (a-z prefix/suffix), Google Trends YouTube Search (12-month scope), Content Gap opportunity indicator, and Competitor Channel Analyzer with Views Per Hour (VPH) velocity measurement
- **Database outlier purge functionality** - Added one-click UI button and backend command `clear_all_outliers_cmd` to cleanly erase stale legacy outlier data

### Fixed

- **Sidebar title truncation** - Expanded sidebar width to 248px and removed text clipping so the full RETubeMatrix name displays cleanly without truncation
- **Profile search input icon overlap** - Replaced raw input with standard UI Input component with 36px left padding so placeholder text never overlaps the magnifying glass icon
- **Multi-size Windows application icon** - Built full 7-resolution `icon.ico` (16x16 to 256x256), explicitly configured NSIS `installerIcon`, and set window icon on startup so taskbar and desktop icons match the official RETubeMatrix brand
- **Outlier search hardcoded fallback elimination** - Removed legacy hardcoded fallback keyword and guaranteed search queries reflect actual user-selected niches

### Fixed

- **Sidebar navigation layout** - Expanded expanded sidebar width from 180px to 224px, completely resolving brand title truncation ("RETubeMatri") and providing spacious layout for Vietnamese navigation items
- **Search input magnifying glass overlap** - Isolated `.input-field` within `@layer components` and enforced strict padding-left clearance on profile search inputs to prevent text overlapping the search icon
- **Windows Taskbar and Desktop icon update** - Generated true 7-resolution Windows icon (`icon.ico` with 16x16 to 256x256 frames), added `cargo:rerun-if-changed` triggers in `build.rs`, and purged stale cached build artifacts so Windows Explorer, Desktop, and Taskbar display the authentic RETubeMatrix logo

### Changed

- **App branding and documentation** - Updated documentation, build configuration, and README for official repository deployment under RETubeMatrix

## [0.20.6] - 2026-11-03

### Added

- **RETubeMatrix official brand identity** - Unified brand identity across headers, window titles, and settings; replaced legacy Youwee donation and external badges with the RETubeMatrix core engine architecture card
- **Categorized log storage** - Automatically separate application execution events into 6 dedicated log files (`download.log`, `channels.log`, `bkt_test.log`, `outlier.log`, `reup.log`, `ai.log`) in the user data directory
- **Interactive tester guide** - Added `TESTER_GUIDE_RETUBEMATRIX.html` featuring 9 core module tabs, 1-click Focus Runner mode, real-time KPI metrics, and light/dark theme toggle for QA verification

### Fixed

- **BKT test channel deadlock** - Eliminated re-entrant SQLite mutex deadlock in `save_bkt_test_channel_db` when creating a second test channel or editing existing test channel settings
- **Profile existence validation** - Validated profile IDs against the multi-browser profile store instead of a nonexistent SQLite table, rejecting invalid or orphaned profiles with informative Vietnamese error feedback
- **YouTube Studio session warmup** - Increased `#avatar-btn` timeout to 25 seconds, actively detected redirection to Google login pages (`accounts.google.com`), and raised clear Vietnamese guidance to prevent abrupt browser termination
- **BKT verification honesty** - Guarded against false clean statuses when YouTube Studio returns unauthenticated or error states, properly flagging jobs as failed

## [0.20.5] - 2026-11-02

### Added

- **Full offline standalone bundle** - Pre-package embedded Python 3.11 with complete site-packages, static FFmpeg/FFprobe binaries, Deno, yt-dlp sidecar, and full BrowserMulti v155.0.8059.12 Chromium runtime inside the installer for clean offline environments
- **Goldmine keyword copy** - Provide one-click keyword copying inside the Recursive Autocomplete dialog

### Fixed

- **BKT Studio copyright check** - Prevent false-positive "Clean" status when 0 videos are checked; automatically clear stale verification states when switching profiles or channels
- **BrowserMulti runtime launch** - Bundle real runtime directory into installer resources and implement automatic fallback to Playwright Chromium launcher if custom binary is unavailable
- **Audio sample rate desync** - Dynamically detect source audio sample rate with FFprobe and apply matching `asetrate` and `aresample` filters, eliminating the 2.5s+ audio/video drift on 48 kHz media
- **Channel settings serialization** - Support both camelCase and snake_case parameters in Tauri channel commands to resolve `Missing field checkInterval`
- **Profile deletion IPC contract** - Support both dictionary tombstone and boolean return contracts when deleting browser profiles
- **Outlier Hunter execution** - Inject `YTDLP_BIN` environment variable into runner processes and return structured error messages instead of empty successes when yt-dlp encounters errors
- **Transcript rate-limit diagnosis** - Clearly distinguish YouTube `RequestBlocked` / HTTP 429 rate limits from "No CC found"
- **Subscriber string parsing & copyright blacklist** - Correctly parse formatted subscriber counts ("340K", "3.4M", "49N") and expand copyright blacklist keywords
- **Outlier schema migration** - Add `acceleration_status` and `view_velocity` database columns

## [0.20.4] - 2026-09-20

### Fixed

- **Browser extension download settings** - Preserve global Youwee download settings such as container, output folder, playlists, and subtitles when a browser extension starts a download
- **AppImage runtime compatibility** - Rebuild Linux AppImages without bundled Wayland, GLib, and GStreamer runtime libraries that can conflict with newer Mesa and WebKitGTK, preventing blank startup windows on modern Linux distributions
- **Auto subtitle language selection** - Respect selected languages for automatic subtitles instead of requesting every available or translated subtitle language
- **Flatpak startup compatibility** - Use the stable GNOME Platform 49 runtime while WebKitGTK 2.52 startup crashes are investigated, avoid initializing the unavailable system tray runtime inside Flatpak, and smoke-test the packaged app under Xvfb in CI

### Changed

- **AppImage release validation** - Validate the rebuilt AppImage runtime layout in Linux CI and re-sign the finalized artifact for updater integrity
- **Firefox extension signing order** - Sign the Firefox extension only after all desktop and Flatpak packages build successfully, preventing failed releases from consuming an AMO version

## [0.20.3] - 2026-08-23

### Fixed

- **Linux deep-link package metadata** - Normalize the `.deb` desktop MIME entry so the release packaging validation completes reliably

### Changed

- **Linux package CI validation** - Build and inspect the `.deb` package in CI to verify that Youwee deep-link desktop entries preserve URL requests

## [0.20.2] - 2026-08-23

### Fixed

- **macOS Monterey queue add** - Fixed the Add button doing nothing on older macOS WebViews that do not support modern browser UUID APIs
- **Linux Firefox extension deep links** - Pass `youwee://` URLs through the packaged `.deb` desktop entry so Download now requests reach Youwee

## [0.20.1] - 2026-08-01

### Added

- **Plugin Store** - Added a dedicated Settings menu to discover and install verified plugin packages from the live GitHub catalog
- **Filename metadata** - Added an optional Download setting to prefix filenames with selected video details such as upload date, views, uploader, duration, resolution, or video ID
- **Romanian language** - Added Romanian translations for the app interface
- **Uzbek language** - Added Uzbek translations for the app interface
- **Turkish language** - Added Turkish translations for the app interface

### Fixed

- **AppImage icons** - Updated Tauri build tooling and compatible dependencies so Linux AppImage packages keep their desktop icon metadata

## [0.20.0] - 2026-07-08

### Added

- **Japanese language** - Added Japanese translations for the app interface
- **Spanish language** - Added Spanish translations for the app interface
- **Universal codec selection** - Added video codec choices to Universal downloads
- **Long video AI Summary** - Added format options and connected multi-part summaries so detailed summaries for long videos preserve more context
- **Linux Flatpak package** - Added a Flatpak release bundle for Linux users on modern distributions where AppImage may require extra FUSE packages

### Changed

- **Flatpak updates** - Skip the built-in AppImage updater when Youwee runs from Flatpak so updates can be managed by Flatpak instead

### Fixed

- **Windows titlebar maximize** - Fixed double-clicking the custom titlebar on Windows maximizing and immediately restoring the window
- **Open in folder actions** - Routed file reveal actions through Youwee's platform-aware app command for more reliable folder opening
- **Dependency detection** - Added `~/.local/bin` to Unix dependency lookup so GUI-launched apps can find user-installed tools more reliably
- **Firefox cookie profiles** - Use the real Firefox profile folder or absolute profile path from `profiles.ini` for browser-cookie downloads while keeping display names in Settings
- **Unicode download titles** - Preserve Unicode video titles from metadata and UTF-8 final file paths instead of falling back to lossy progress output
- **Pasted text URLs** - Extract HTTP(S) links from pasted text across Download, Universal, Gallery, and metadata inputs
- **Windows safe filenames** - Harden yt-dlp filename handling on Windows with path-aware trimming and Windows-safe filename rules without changing output templates
- **OpenAI summaries** - Automatically adjust OpenAI and OpenAI-compatible Proxy sampling parameters so legacy and reasoning models can generate summaries without 400 errors

## [0.19.0] - 2026-06-30

### Added

- **Library collections** - Added automatic Library collections for expanded playlists, channel downloads, and split chapter files
- **Library delete behavior** - Added a setting to choose whether deleting a Library item also deletes the media file
- **Frame rate** - Added an option to prefer 30 FPS downloads in Download, Universal, and Channels, with a clear quality warning
- **Downloaded video memory** - Added an optional setting to detect videos already in Library across Download, Universal, Gallery, and Channels, with ask, skip, or allow duplicate handling
- **Split tool** - Added an optional item action to split completed media files into named segments using FFmpeg

### Changed

- **Library history** - Removed the max history entries setting so Library can keep downloaded video records until users delete them
- **Library summaries** - Refined Library item actions and moved full AI summaries into a dedicated reader dialog with text size controls
- **Queue download folders** - Ask whether queued items should use the new folder when the global download folder changes

### Fixed

- **Extension cold-start links** - Fixed browser extension download links opening Youwee without adding the video on cold app launch
- **AI Summary numbering** - Fixed ordered lists restarting at 1 when rendered with blank lines between topics
- **Channel fetch controls** - Added a stop action for channel video fetching and avoided re-fetching when opening a just-browsed followed channel
- **Duplicate dialog thumbnails** - Fixed already-downloaded video dialogs showing a placeholder when the Library entry already has a thumbnail
- **Settings icons** - Fixed oversized Font Awesome icons breaking Settings layouts when icon CSS is unavailable

## [0.18.0] - 2026-06-29

### Added

- **Queue file numbering** - Added an option to prefix regular queued downloads with their queue order
- **Queue output folder** - Added a queue item action to choose a download folder for individual downloads
- **yt-dlp advanced options** - Added vetted advanced options for users who need more control over yt-dlp downloads
- **Playlist file numbering** - Added a Download setting to prefix playlist downloads with their playlist order
- **Embedded chapter splitting** - Added Download settings to split embedded video chapters into separate files and optionally number chapter files
- **Extension AI Summary** - Added a Summary button in the browser extension to open YouTube videos directly in AI Summary
- **AI summary token limit** - Added an optional Settings field to set maximum output tokens for generated summaries
- **Cookie skip rules** - Added tag-based rules to skip browser or cookie file authentication for matching sites, with Facebook Reels included by default

### Changed

- **Extension interface** - Refined the browser extension popup and floating menu with a cleaner style that matches the music player

### Fixed

- **Recovered plugin downloads** - Fixed successful `download.failed` plugin recoveries still leaving the original queue item marked as failed
- **Plugin retry workflows** - Fixed retried failed downloads not picking up newly assigned plugin workflows
- **Extension floating button** - Fixed the browser extension floating button not appearing or crashing on tabs that were already open when the extension was installed or reloaded
- **Extension cold-start downloads** - Fixed browser extension `Download now` links opening Youwee without adding the video when the desktop app was not already running
- **AI summary video info** - Fixed AI Summary getting stuck while fetching video info for videos whose subtitles are available but video formats cannot be selected
- **AI summary length** - Removed the default hard-coded summary output token limit so providers can use their model defaults unless users set a custom value
- **Long video titles** - Fixed downloads failing when very long titles are used as filenames

## [0.17.2] - 2026-06-17

### Changed

- **Interface font and icons** - Bundled the app font and icons so the interface stays consistent without relying on external CDN resources
- **Plugin details layout** - Changed imported plugin details in Settings to use tabs for Information, Requested Permissions, and Runtime & Compatibility
- **Channel Load More** - Changed Channel browse and followed-channel detail pages to use the floating Load More button style from YouTube keyword search

### Fixed

- **Music player visibility** - Fixed the collapsed music player leaving an invisible overlay that could block buttons and restart playback when users clicked controls underneath
- **Channel completion state** - Fixed followed channel videos losing their completed state after reopening the app by persisting manual channel completions and restoring status from exact video IDs and existing history files
- **Duplicate channel follows** - Return the existing followed channel record when following the same URL again so video sync does not target a non-existent channel id

## [0.17.1] - 2026-06-11

### Added

- **Upcoming live scheduling** - Added an inline queue action to schedule another download attempt when a YouTube live event has not started yet
- **Data Export YouTube keyword source** - Added a YouTube keyword source so search results can be exported from Data Export
- **CLI output folder** - Added `--output` / `-o` so each CLI-queued download can use its own absolute output folder

### Changed

- **Schedule controls** - Refined the schedule popover and active schedule state with quicker presets, clearer preview text, and a more compact countdown display

### Fixed

- **FFmpeg app-managed updates** - Store the installed app-managed FFmpeg release version so update checks no longer loop when the FFmpeg binary reports an internal git build version
- **FFmpeg dependency status** - Show auto-detected system FFmpeg as System instead of App managed, and report clearer app-managed install verification errors
- **yt-dlp bundled version** - Prefer the sidecar shipped with the current app build so old app-managed binaries no longer mask newer bundled releases
- **Channel yt-dlp source** - Fixed Channel browsing to respect the selected yt-dlp source/channel, including Stable and System
- **Escaped pasted URLs** - Normalize shell-escaped URL punctuation in Download, Universal, and Gallery inputs so pasted links like `watch\?v\=...` enqueue the intended video
- **CLI escaped URLs** - Normalize shell-escaped URL punctuation so quoted YouTube URLs like `watch\?v\=...` download the intended video
- **Scheduled livestream errors** - Show clear upcoming livestream messages instead of grouping scheduled YouTube lives into generic skipped or unspecified errors
- **Windows CLI output** - Fixed `youwee -V` and `youwee --help` not printing output in Windows terminals

## [0.17.0] - 2026-06-07

### Added

- **Command-line interface** - Added a local `youwee` CLI with install controls, structured download requests, and options for quality, audio mode, queue-only, playlist handling, subtitles, download sections, live-from-start, and skip-live behavior
- **Skip live streams** - Added a download setting to skip currently live videos from the YouTube and Universal interfaces
- **AI summary search** - Added SQLite FTS5-powered Library search across titles, URLs, file paths, and saved AI summaries, with search scope controls for all content, details only, or AI summaries only
- **YouTube keyword search** - Added a dedicated YouTube keyword search view with filter controls for upload date, duration, sort order, and video features, letting selected results be added directly to the download queue
- **Queue status tabs** - Added compact status tabs to the YouTube and Universal queues for filtering videos by download state
- **Plugin SDK YouTube search bridge** - Exposed app-managed YouTube keyword search to JavaScript plugins through `ctx.youwee.youtube.searchVideos(...)` with typed filters and continuation support

### Changed

- **AI generation timeout** - Expanded the AI Generation Timeout options up to 60 minutes and now applies the selected timeout to AI provider HTTP requests for long-video summaries
- **Application database filename** - Renamed the internal SQLite database from `logs.db` to `youwee.db` with automatic migration from the legacy file while keeping the old file as a backup

### Fixed

- **Bilibili HTTP 412** - Added browser-like headers to Bilibili yt-dlp requests to prevent `HTTP Error 412`

## [0.16.0] - 2026-06-02

### Added

- **Persistent download queue** - Added an optional Download setting to save YouTube, Universal, and Gallery queue items in the app database so queued items can be restored after closing and reopening Youwee
- **Data Export** - Added a new Data Export workspace for exporting YouTube playlist and channel data, choosing exactly which fields to include, saving files in formats such as CSV, Excel, JSON, Markdown, HTML, SQLite, and Word, and keeping exported files in Library for later access
- **Telegram Remote Download** - Added a Remote Download settings section with Telegram long-polling control, allowed chat ID tags, bot command guide, `/add`, `/download`, `/status`, `/queue`, `/stop`, and `/help` support, plus optional quality shortcuts such as `720`, `audio`, and `mp3`

### Changed

- **Download queue additions while running** - Allowed adding new URLs to YouTube, Universal, and Gallery queues while downloads are already running, with queue workers waiting briefly for newly added items before ending the active session
- **YouTube format selection** - Changed the default YouTube video codec to Auto so new downloads no longer force H.264-only format selection and better match Universal downloads for videos without matching AVC streams

### Fixed

- **Linux deb install conflict** - Renamed the bundled yt-dlp sidecar to a Youwee-specific binary name so `.deb` installs no longer conflict with distro-managed `yt-dlp` packages
- **System dependency paths** - Improved Windows PATH resolution for yt-dlp, FFmpeg, Deno, gallery-dl, and helper tools
- **Firefox cookie profile selection** - Prioritized the active Firefox profile from `profiles.ini` so browser-cookie downloads target the profile where cookies are most likely stored

## [0.15.1] - 2026-05-27

### Changed

- **UI and UX refinements** - Improved the app's overall UI and UX across AI Features, metadata, plugin settings, guide dialogs, and shared notification flows for a more consistent Youwee experience
- **Plugin SDK v2.0.0 support** - Upgraded plugin support to `youwee-sdk` `v2.0.0` with stricter read/write/AI permission enforcement and TypeScript-first plugin workspaces

## [0.14.1] - 2026-05-24

### Changed

- **Plugin workflow guidance and permissions flow** - Refined plugin import, permission approval, workspace guide, and configuration UI so plugin setup, workflow assignment, and plugin guides are clearer inside Settings
- **Plugin authoring flexibility** - Updated workspace and SDK integration to support flexible Lucide plugin icons and a cleaner Deno runtime test flow for plugin authors

### Fixed

- **Plugin runtime logs and output summaries** - Reduced duplicated plugin log noise, skipped storing raw result protocol output, and highlighted follow-up output file paths more clearly in post-processing step logs
- **Plugin guide rendering and localized docs** - Fixed guide dialog overflow and preserved localized `README.<locale>.md` files for installed plugins
- **Plugin configuration polish** - Improved multi-select configuration controls, validation timing, and plugin enable/import prompts to better match the rest of the app UI

## [0.14.0] - 2026-05-24

### Added

- **Library tagging and collections** - Added free-form tags and virtual collections for Library items, including item-level assignment, quick chip filters, collection management, and advanced filtering by tags or collections
- **Signed plugin system and SDK workflow** - Added signed `.ywp` plugins with workspace attach/debug flow, typed configuration fields, localized plugin guides, permission review, workflow assignment, logs, and `youwee-sdk` packaging/signing support

### Changed

- **Gallery URL input alignment** - Updated the Gallery input to match the YouTube single/multiple flow more closely, including the Add button style, batch layout, URL hints, and language copy across locales

### Fixed

- **Arch Linux startup crash with GBM EGL display** - Added a Linux WebKitGTK fallback that disables the GBM renderer by default to avoid startup aborts on some Arch-based systems

## [0.13.3] - 2026-05-14

### Added

### Changed

### Fixed

- **Followed channel video fetching loop** - Fixed a pagination regression that could leave followed channels stuck in a continuous fetching cycle and prevent loading channel video lists reliably
- **Channel fetch progress race** - Channel browse progress now ignores stale events from previous requests when switching channels or refetching quickly
- **Load More inflating new-video counts** - Older videos loaded from additional channel pages are no longer saved as new items, preventing incorrect new-video badges and tray counts

## [0.13.2] - 2026-05-10

### Added

- **Channel video pagination with Load More** - Channels now load the first 100 videos by default and let you fetch additional batches on demand from the browse and detail views
- **Thai language support** - Added full Thai localization across the app, including UI screens, settings, subtitle tools, download flows, and language selectors
- **Arabic language support** - Added full Arabic localization across the app, including UI screens, settings, subtitle tools, download flows, plus RTL document direction handling

### Changed

### Fixed

- **Channel browse capped at 50 videos** - Fixed channel and playlist browsing incorrectly stopping at 50 videos when more items were available
- **Cookie error dialog classification** - Fixed fresh-login cookie requirements being shown as a browser DB lock error, and now route DB-lock vs authenticated-cookie issues to different dialogs

## [0.13.1] - 2026-04-26

### Added

- **LM Studio AI provider** - Added LM Studio as a local OpenAI-compatible AI provider with a configurable local endpoint and no API key requirement

### Changed

### Fixed

- **4K WebM post-processing** - Fixed WebM downloads selecting MP4/H.264-compatible streams that could make FFmpeg fail during post-processing conversion

## [0.13.0] - 2026-04-15

### Added

- **Floating music player** - Added an in-app audio player with queue, playback controls, speed, and volume
- **Aria2 external downloader integration** - Added support for `aria2c` as an external downloader with customizable arguments and localized error handling
- **Rename downloaded files from Queue and Library** - Added post-download rename actions (YouTube + Universal queue and Library) with DB/path synchronization and multilingual UI texts
- **Advanced Library filters and sorting** - Added Advanced Filters panel (media type, date range, format, quality), `title + filepath` search, and sortable history list with persisted sort preference
- **Dedicated Gallery download screen** - Added a new `Gallery` menu below Universal with its own URL input, batch import, queue, folder picker, and start/stop flow for gallery-style sources powered by `gallery-dl`

### Changed

- **Dynamic queue processing while downloading** - Queue workers now claim items at runtime so newly added videos are appended and downloaded automatically without pressing Start again

### Fixed

- **History rename unit tests on CI** - Serialized shared in-memory DB tests to avoid flaky `History entry not found` failures under parallel `cargo test`
## [0.12.0] - 2026-03-04

### Added

- **Dependency source selector (yt-dlp/FFmpeg)** - Added source switching in Settings → Dependencies so users can choose between app-managed binaries and system-managed binaries
- **Safety confirmation before switching to system source** - Added a confirmation dialog when switching yt-dlp/FFmpeg to system source to prevent accidental changes

### Changed

- **OS-aware system source label** - System source label now adapts by platform (`Homebrew` on macOS, `PATH` on Windows, package manager on Linux)
- **Automated GitHub release notes in build workflow** - Enabled `generate_release_notes` in the release workflow so published releases include auto-generated notes
- **Windows custom title bar integration** - Replaced the native Windows title bar with app-themed custom controls (drag region, minimize/maximize/close) for consistent theming

### Fixed

- **Windows download history recording** - Captured final output filepath reliably on Windows so completed downloads are correctly added to Library history
- **Windows redownload path parsing** - Fixed output folder extraction for backslash-based Windows paths when redownloading items
- **Non-UTF-8 yt-dlp output on Windows** - Added GBK/ANSI decoding fallback and `--print-to-file` handling so non-UTF-8 locales still capture final file paths correctly
- **Library auto-refresh after download completion** - Library history now refreshes automatically when a download status changes to `finished`
- **Douyin modal URL compatibility** - Normalized `douyin.com` URLs with `modal_id` into canonical `/video/{id}` format in backend yt-dlp calls and frontend deep-link parsing

## [0.11.1] - 2026-03-01

### Added

- **French, Portuguese, and Russian language support** - Full localization for all UI screens, settings, error messages, and metadata labels in Français, Português, and Русский
- **Backend error localization** - Backend error messages (download failures, network errors, etc.) are now translated to the user's selected language instead of always showing English

### Changed

- **Refactored transcript fallback chain** - Unified transcript fallback logic across AI summary and processing tasks for more consistent behavior

### Fixed

- **Transcript fallback for Douyin and TikTok** - Improved transcript extraction for Douyin and TikTok videos that previously failed silently
- **Transcript errors and short captions** - Transcript errors are now preserved for diagnostics instead of being silently swallowed; short captions are accepted as valid transcripts instead of being rejected
- **TikTok default settings** - Aligned TikTok default download settings to match platform conventions

## [0.11.0] - 2026-02-20

### Added

- **Browser Extension for one-click download (Chromium + Firefox)** - You can now send the current video page from browser to Youwee and choose `Download now` or `Add to queue`
- **Extension setup in Settings** - Added a new Settings → Extension section with direct download buttons and easy install steps for Chromium and Firefox

### Changed

- **UI/UX refresh for YouTube and Universal pages** - Simplified input, preview, queue, and title-bar interactions for a cleaner and more consistent experience

### Fixed

- **Consistent dependency resolution across features** - Unified yt-dlp/FFmpeg source handling in download, metadata, channels, and background polling so selected source is applied consistently
- **Strict system-mode behavior** - When system source is selected and binary is missing, app now fails with a clear error instead of silently falling back

## [0.10.1] - 2026-02-15

### Added

- **ASS font settings** - Added configurable subtitle font family/size for ASS export and subtitle preview
- **Line-break workflow** - Added quick auto line-break action and Shift+Enter newline support while editing subtitle text
- **Configurable auto retry** - Added Auto Retry settings for YouTube and Universal downloads with customizable retry attempts and delay to recover from unstable network/live interruptions automatically

### Changed

### Fixed

- **Download failure diagnostics** - Improved yt-dlp failure messages to include clearer error reasons, enabling smarter transient-error retry behavior

## [0.10.0] - 2026-02-15

### Added

- **Subtitle Workshop** - Added an all-in-one subtitle page for SRT/VTT/ASS with editing, timing tools, find/replace, auto-fix, and AI actions (Whisper, Translate, Grammar Fix)
- **Advanced subtitle tools** - Added waveform/spectrogram timeline, shot-change sync, realtime QC with style profiles, split/merge tools, translator mode (source/target), and batch project tools

### Changed

### Fixed

## [0.9.4] - 2026-02-14

### Added

- **Processing output folder picker** - Added a selectable output directory in Processing chat. Default stays the main video folder, and generated outputs now honor the selected folder for AI commands and quick actions
- **Multi-file attachments in Processing AI chat** - Processing chat now supports image/video/subtitle attachments (picker + drag/drop) with contextual previews and metadata
- **Language request shortcut in Settings** - Added a quick link in Settings → General for users to vote/request next language support on GitHub Discussions
- **System tray app update action** - Added a new tray menu action to check for Youwee updates directly from tray

### Changed

- **Deterministic subtitle/merge command generation** - Processing command generation now handles subtitle burn-in and multi-video merge (including intro/outro ordering hints) before AI fallback for more reliable results
- **Clearer system tray channel check label** - Renamed "Check All Now" to "Check Followed Channels Now" to better reflect checking followed channels
- **Simplified page headers** - Removed leading title icons from Metadata, Processing, and AI Summary pages for a cleaner look

### Fixed

- **Video info fetch fails with authentication/proxy** - Fixed yt-dlp argument ordering so cookie and proxy flags are inserted before the `--` URL separator, preventing `Failed to fetch video info` errors while keeping downloads working
- **Stable channel update check always shows available** - Fixed yt-dlp stable/nightly update check to read the installed channel binary version (`--version`) instead of file-existence metadata, so "Up to date" is shown correctly after update
- **Bundled update status and binary source mismatch** - Fixed bundled update flow to show latest available version in Settings and prefer the user-updated `app_data/bin/yt-dlp` binary when present, so updating bundled actually takes effect
- **Processing page video info redesign** - Refreshed the section below player with a YouTube-style title + modern metadata chips, and removed hover color shift/shadow on codec badges for cleaner visuals
- **Prompt Templates dropdown close behavior** - Fixed Processing Prompt Templates dropdown to auto-close on outside click and Escape key
- **Duplicate URL count in Universal input** - Fixed the URL count badge showing duplicated number (e.g. `1 1 URL`) in Universal URL input

## [0.9.3] - 2026-02-14

### Added

- **Subtitle download in Metadata** - New subtitle toggle in the Metadata settings bar to download subtitles (manual + auto-generated) alongside metadata. Includes a popover to select languages and format (SRT/VTT/ASS)

### Changed

- **Improved time range input UX** - Replaced plain text inputs with auto-formatting time inputs that insert `:` separators as you type (e.g. `1030` → `10:30`, `10530` → `1:05:30`). Smart placeholder shows `M:SS` or `H:MM:SS` based on video duration. Real-time validation with red border for invalid format or when start >= end. Shows total video duration hint when available

## [0.9.2] - 2026-02-13

### Added

- **Time range download** - Download only a specific portion of a video by setting start and end times (e.g. 10:30 to 14:30). Available per-item on both YouTube and Universal queues via the scissors icon. Uses yt-dlp's `--download-sections` under the hood
- **Auto-check FFmpeg updates on startup** - FFmpeg update check now runs automatically when the app starts (for bundled installs). If an update is available, it shows in Settings > Dependencies without needing to manually click the refresh button

## [0.9.1] - 2026-02-13

### Fixed

- **App crash on macOS without Homebrew** - Fixed startup crash caused by missing `liblzma` dynamic library. The `xz2` crate now uses static linking, making the app fully self-contained without requiring Homebrew or system libraries
- **Auto-download ignores user settings** - Channel auto-download now respects per-channel download preferences (Video/Audio mode, quality, format, codec, bitrate) instead of using hardcoded values. Each channel has its own download settings configurable in the channel settings panel
- **Security hardening** - FFmpeg commands now use structured argument arrays instead of shell string parsing, preventing command injection. Added URL scheme validation and `--` separator for all yt-dlp calls to block option injection. Enabled Content Security Policy, removed overly broad shell permissions, and added `isSafeUrl` validation for rendered links
- **Video preview fails for MKV/AVI/FLV/TS containers** - Preview detection now checks both container format and codec. Videos in unsupported containers (MKV, AVI, FLV, WMV, TS, WebM, OGG) are correctly transcoded to H.264 preview. HEVC in MP4/MOV no longer unnecessarily transcoded on macOS
- **Scheduled downloads not visible in tray mode** - Desktop notifications now fire when a scheduled download starts, stops, or completes while the app is minimized to system tray. Tray menu shows active schedule status (e.g. "YouTube: 23:00"). Schedule works on both YouTube and Universal pages
- **Quit from tray kills active downloads** - Tray "Quit" now uses graceful shutdown instead of force-killing the process, allowing active downloads to finish cleanup and preventing corrupted files
- **Dock icon setting lost on restart (macOS)** - The "Hide Dock icon on close" preference is now synced to the native layer on app startup, not only when visiting the Settings page
- **Universal queue shows skeleton instead of URL while loading** - Replaced pulsing skeleton placeholder with the actual URL text and a "Loading info..." spinner badge. When metadata fetch fails, items now exit loading state gracefully instead of showing skeleton forever

## [0.9.0] - 2026-02-12

### Added

- **Channel Follow & Auto-Download** - Follow YouTube channels, browse their videos, select and batch download with full quality/codec/format controls. Background polling detects new uploads with desktop notifications and per-channel new video badges. Collapsible followed channels panel with system tray close-to-tray support
- **Large file preview confirmation** - Configurable file size threshold (default 300MB) that shows a confirmation dialog before loading large videos in Processing. Threshold adjustable in Settings → General → Processing
- **i18n-aware Settings search** - Settings search now works in all languages. Searching in Vietnamese (e.g. "giao diện") or Chinese returns matching results. English keywords still work as fallback regardless of language

### Fixed

- **Processing page white screen on 4K VP9/AV1/HEVC videos (Linux)** - GStreamer's AAC audio decoder crashes WebKitGTK when playing VP9/AV1/HEVC videos. Preview now uses dual-element approach: silent H.264 video + separate WAV audio synced via JavaScript, completely bypassing the broken AAC path. If video playback still fails, auto-falls back to a static JPEG thumbnail. Works across macOS, Windows, and Linux

## [0.8.2] - 2026-02-11

### Added

- **Multilingual update notes** - Update dialog now shows release notes in user's language (English, Vietnamese, Chinese). CI automatically extracts changelogs from language-specific CHANGELOG files
- **8K/4K/2K quality options for Universal downloads** - Quality dropdown now includes 8K Ultra HD, 4K Ultra HD and 2K QHD options, matching the YouTube tab. Falls back gracefully if the source doesn't have high-res formats
- **Live from start toggle for Universal downloads** - New toggle in Advanced Settings to record live streams from the beginning instead of the current point. Uses yt-dlp's `--live-from-start` flag
- **Video preview for Universal downloads** - Automatically shows thumbnail, title, duration and channel when adding URLs from TikTok, Bilibili, Facebook, Instagram, Twitter and other sites. Thumbnails are also saved to Library history
- **Smarter platform detection** - Library now correctly identifies and tags all 1800+ sites supported by yt-dlp (Bilibili, Dailymotion, SoundCloud, etc.) instead of showing "Other". Added Bilibili as a dedicated filter tab

### Fixed

- **Processing page freezes on video upload (Linux)** - Video files were read entirely into RAM via `readFile()`, causing OOM crashes and white screens. Now uses Tauri's asset protocol to stream videos directly without loading into memory. Also adds error boundary to prevent unrecoverable white screens, video error handling with codec-specific messages, blob URL cleanup to prevent memory leaks, and correct MIME type detection for non-MP4 formats
- **Broken thumbnails in Library** - Fix thumbnails from sites like Bilibili that use HTTP URLs. Thumbnails now gracefully fall back to a placeholder icon if they fail to load
- **Library not refreshing on page switch** - Library now automatically loads latest downloads when navigating to the page instead of requiring a manual refresh

## [0.8.1] - 2026-02-09

### Fixed

- **HTTP 416 error on re-download** - Add `--force-overwrites` flag to prevent "Requested range not satisfiable" errors caused by stale `.part` files from interrupted downloads
- **Settings not applied when adding to queue** - Fix stale closure issue where changing format (Video → Audio) immediately before adding URL would use old settings. Now uses ref to always capture current settings
- **Library source filter not working** - Fix parameter name mismatch between frontend (`sourceFilter`) and backend (`source`) that caused TikTok, Facebook and other platform filters to show all entries instead of filtered results. Also fix search and count queries to respect active filters

## [0.8.0] - 2026-02-09

### Added

- **DPAPI error detection** - Detect Chrome 127+ App-Bound Encryption errors on Windows, show troubleshooting hint to use Firefox or Cookie File mode
- **Image attachment in Processing** - Upload images via attach button or drag & drop, AI generates FFmpeg commands for overlay, watermark, intro/outro, PiP and more
- **Custom Whisper backend** - Configure custom endpoint URL and model for Whisper transcription, compatible with OpenAI-compatible APIs
- **SponsorBlock integration** - Auto-skip sponsors, intros, outros and promotions using community data. Three modes: Remove all (cut segments), Mark all (chapter markers), or Custom per-category control
- **Scheduled downloads** - Schedule downloads to start at a specific time with optional stop time. Quick presets (1h, 3h, tonight, tomorrow) or custom time picker. Works on both YouTube and Universal pages

### Changed

- **Processing input layout** - Move prompt templates button into input card, textarea on top with action buttons below
- **yt-dlp channel selector** - Redesigned from segmented toggle to radio cards with descriptions, active badge, and install status for clearer selection

### Fixed

- **8K download gets 4K** - High-res (8K/4K/2K) ignored user's codec setting and always forced VP9. Now respects codec choice and prioritizes AV1 for 8K, VP9 for 4K/2K when set to Auto
- **Download speed not showing** - Fixed regex not capturing speed and ETA from yt-dlp progress output
- **Failed to fetch video info for YouTube** - Add Deno JS runtime to video info, transcript, playlist, and subtitle fetching (same as download)
- **Video title shows Unknown in Library** - Extract title from filepath when yt-dlp doesn't output Destination message
- **Slow yt-dlp version loading** - Eliminated redundant version checks on startup (7 sequential calls → 1), channel info now uses lightweight file-exists check instead of running binaries

## [0.7.1] - 2026-02-06

### Added

- **FFmpeg check before download** - Shows FFmpeg install dialog when starting download with Best/4K/2K quality without FFmpeg installed
- **Failed download hints** - Shows "View Logs page for details" when download fails
- **Troubleshooting tips in Logs** - Auto-detect common errors and show fix suggestions (FFmpeg missing, auth required, rate limit, etc.)
- **Windows cookie error handling** - Auto-detect browser cookie lock errors, show retry dialog with instructions to close browser
- **Windows cookie warning** - Shows warning in Settings → Network when using browser cookie mode on Windows

### Fixed

- **Metadata ignores playlist** - URLs with `?list=` now fetch only single video metadata
- **Windows path handling** - Fixed download folder detection for Windows paths (C:\, D:\)

### Changed

- **Larger default window** - 1100x800 (was 1000x700)
- **Disable reload in production** - Block right-click menu, F5, Ctrl+R

## [0.7.0] - 2026-02-05

### Added

- **Metadata page** - Fetch video info (JSON, description, comments, thumbnail) without downloading video
- **Live stream download support** - Toggle in Settings → Download, shows LIVE badge on queue items
- **Download speed limit** - Limit bandwidth with custom value and unit (KB/s, MB/s, GB/s)

### Fixed

- **ChromeOS compatibility** - Fixed "invalid output path" error, auto-creates Downloads folder

### Changed

- **New Download settings section** - Moved Post-processing, Live Stream, Speed Limit to dedicated section
- **Compact Advanced Settings popover** - Better fit for small screens with scroll support

## [0.6.1] - 2026-02-03

### Added

- **yt-dlp channel selection** - Choose between Bundled, Stable, or Nightly versions in Settings → Dependencies
- **Auto-download yt-dlp Stable** - Automatically downloads latest stable yt-dlp on first launch
- **Fallback to bundled** - Uses bundled yt-dlp when Stable/Nightly not available (no internet, download failed)

### Changed

- **Default channel is now Stable** - App defaults to Stable channel instead of Bundled for latest features and fixes
- **Status indicators** - Shows "Using bundled temporarily..." when falling back, "Downloading yt-dlp..." during auto-download
- **Embed Thumbnail off by default** - Disabled by default since it requires FFmpeg

### Fixed

- **Hidden console windows on Windows** - yt-dlp, FFmpeg, and other background processes no longer spawn visible terminal windows
- **FFmpeg/Deno download with progress** - Shows download percentage and stage (downloading, extracting, verifying) instead of hanging indefinitely
- **Display download error details** - Failed downloads now show error message in the queue item instead of just "Error" status


## [0.6.0] - 2026-02-03

### Changed

- **Replaced Bun with Deno** - Now uses Deno runtime for YouTube JavaScript extraction (required by yt-dlp)
- **Auto-download Deno on first launch** - App automatically downloads Deno if not installed
- **Setup progress dialog** - Shows "Setting Up YouTube Support" popup when downloading Deno on first launch

### Fixed

- **YouTube downloads with bundled Deno** - Fixed path escaping issue when Deno is installed in Application Support folder (paths with spaces)
- **Use `--js-runtimes` flag** - Switched from `--extractor-args` to `--js-runtimes deno:PATH` for better compatibility
- **yt-dlp update not taking effect** - Fixed issue where updated yt-dlp version was not used after restart (now prioritizes user-updated version over bundled)


## [0.5.4] - 2026-01-28

### Fixed

- **AI Settings restored** - Proxy URL input, API key hints with platform links, and transcript language reordering now work correctly

### Changed

- Wider Model input and Summary Style dropdown for better readability


## [0.5.3] - 2026-01-28

### Added

- **Multi-language support (i18n)** - Full internationalization with English, Vietnamese, and Chinese (Simplified)
- **Language switcher** in Settings → General → Appearance
- **Localized README** - Vietnamese and Chinese versions in `/docs`


## [0.5.2] - 2026-01-27

### Fixed

- About section now shows correct GitHub links (`vanloctech/youwee`)
- Restored "Made with ❤️ by Vietnam" branding
- Added License link in About section
- Restored Auto-check for updates toggle in About section


## [0.5.1] - 2026-01-27

### Added

- **OpenAI Whisper transcription** - Fallback for videos without captions, uses Whisper API to transcribe audio (~$0.006/min)
- **DeepSeek & Qwen AI providers** - More AI options for video summarization
- **Proxy support** - Configure HTTP/HTTPS/SOCKS proxy for yt-dlp downloads
- **Clear All button** in Processing History - Quickly remove all history entries
- **Settings search** - Find settings quickly with keyboard search

### Changed

- **Settings page redesigned** - New sidebar navigation with 5 sections (General, Dependencies, AI, Network, About)
- **Universal page** now has Video/Audio toggle like YouTube page for consistency
- **macOS app icon** updated with proper Apple guidelines padding

### Fixed

- Downloads now save to library correctly when using updated yt-dlp


## [0.5.0] - 2026-01-27

### Added

- AI Video Processing page - Edit videos using natural language prompts
- Post-processing settings - Embed metadata and thumbnails into downloaded files
- Embed Metadata settings - Add title, artist, description to files (enabled by default)
- Embed Thumbnail settings - Add cover art/thumbnail to files (enabled by default, requires FFmpeg)

### Fixed

- AI error message "AI Features is disabled" no longer shows when download fails (Windows)
- Summarize button now hidden when AI features disabled
- Summarize button hidden on failed download items to prevent confusion
- yt-dlp version now correctly shows updated version after update
- FFmpeg update checker - check for new versions from GitHub releases
- Bun runtime update checker - check for new versions from GitHub releases


## [0.4.1] - 2026-01-24

### Added

- Video Authentication support for age-restricted, private, and members-only videos
- Browser cookie extraction (Chrome, Firefox, Safari, Edge, Brave, Opera, Vivaldi)
- Browser profile detection with display names
- Cookie file support as alternative authentication method
- macOS Full Disk Access guidance for browser cookie access
- Hindi and Portuguese (Brazil) language options for summaries
- Debug logging for Gemini API requests in dev mode

### Changed

- Updated OpenAI models to latest: GPT-5.2, GPT-5.1, GPT-5, GPT-4.1 series
- Gemini API now uses x-goog-api-key header instead of query parameter
- Thinking models (Gemini 2.5, 3) no longer use generationConfig restrictions
- yt-dlp now uses nightly builds for latest features and fixes
- Improved logo clarity in sidebar and about section (128px instead of 64px)
- Error messages now show full details with auth guidance when needed

### Fixed

- Gemini API 429 errors by switching to header-based authentication
- Gemini thinking models returning empty responses
- Age-restricted video errors now guide users to enable authentication
- Video preview and queue items now show actual error messages

## [0.4.0] - 2026-01-24

### Added

- AI-powered video summarization with support for Gemini, OpenAI, and Ollama (local)
- Proxy AI provider for OpenAI-compatible APIs with custom domain (Azure, LiteLLM, OpenRouter)
- Dedicated AI Summary page for quick video summarization without downloading
- Configurable transcript languages with priority order
- Video transcript extraction from YouTube subtitles (including auto-generated)
- Concise summary style option (between Short and Detailed)
- Summarize button in queue items to generate summary without downloading
- YouTube Troubleshooting option for actual player.js version (fixes download issues)
- Re-download with progress tracking in Library
- Copy summary button in Library items

### Changed

- Redesigned download settings with clear Video/Audio toggle for better UX
- Merged App Updates section into About section in Settings for cleaner UI
- macOS app icon now follows Apple guidelines with rounded corners and proper sizing (84.4%)
- Improved About section with modern card layout and quick links
- Re-download now updates existing history entry instead of creating new one

### Fixed

- Re-download quality mapping (480p → 480, 1080p → 1080, etc.)
- Re-download for summary-only entries now uses best quality and user's output path
- FFmpeg check now defaults to false, properly requiring FFmpeg for best/2K+ quality
- Improved Gemini API error handling with detailed error messages
- Fixed transcript extraction to support YouTube auto-generated subtitles
- Added video description as fallback when no subtitles available
- Prevent transcript cross-contamination between videos
- Show full yt-dlp command in logs instead of just args

## [0.3.2] - 2026-01-22

### Added

- FFmpeg warning dialog when selecting 2K/4K/8K/best quality without FFmpeg installed
- SHA256 checksum verification for FFmpeg downloads on all platforms
- Linux ARM64 support for FFmpeg downloads

### Changed

- FFmpeg source for Windows/Linux changed to BtbN/FFmpeg-Builds (more reliable, with checksums)
- FFmpeg source for macOS now uses vanloctech/ffmpeg-macos repository

### Fixed

- macOS Intel FFmpeg download URL (now uses universal binary from ffmpeg-macos repo)

## [0.3.1] - 2025-01-21

### Added

- Bun runtime support for YouTube downloads (fixes 360p-only issue on some systems)

### Fixed

- macOS updater now downloads correct architecture-specific update files

## [0.3.0] - 2025-01-20

### Added

- Download History / Library page with SQLite storage
- Logs page for tracking download activities
- Universal Download page for non-YouTube sources (1000+ sites)
- Gradient progress bar with shimmer effect
- Quality/format badges in download queue
- Per-item download settings in queue

### Changed

- Simplified audio quality options to match YouTube's available bitrates
- Reduced max log entries from 1000 to 500 for performance

### Fixed

- Extract video title from final filepath for accurate logs
- Show actual file size after MP3 conversion
- Use proper FFmpeg postprocessor args for audio bitrate
- Sum video+audio stream sizes for accurate total filesize

## [0.2.1] - 2025-01-15

### Fixed

- Various bug fixes and stability improvements

## [0.2.0] - 2025-01-10

### Added

- Playlist support with batch downloading
- Multiple quality options (8K, 4K, 2K, 1080p, 720p, 480p)
- Multiple format support (MP4, MKV, WebM, MP3, M4A, Opus)
- Subtitle download with language selection
- Concurrent downloads (up to 5 parallel)
- Auto-update with secure signature verification

### Changed

- Improved UI with 6 color themes
- Better error handling and user feedback

## [0.1.0] - 2025-01-01

### Added

- Initial release
- YouTube video download
- Basic quality selection
- Dark/Light mode
- Bundled yt-dlp
