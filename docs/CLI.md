# RETubeMatrix Command Line Interface

RETubeMatrix accepts a video URL directly from the command line, making it easy to
script downloads without manually registering the `retubematrix://` protocol handler.

When invoked with a URL, RETubeMatrix sends the request to the local app, adds the URL
to the download queue, and starts the download immediately unless `--queue-only`
is passed. CLI URL requests do not force the main window to open, so RETubeMatrix can
stay in the system tray.

## Usage

```
retubematrix <url> [options]
retubematrix --url <url> [options]
```

If RETubeMatrix is already running, the new URL is sent to the running instance.

## Installation

Open **Settings → General → Command line (CLI)** and install the terminal
command from there.

### macOS

RETubeMatrix creates a `retubematrix` symlink at `/usr/local/bin/retubematrix` when possible. If
that location is not writable, it falls back to `~/.local/bin/retubematrix`.

### Windows

RETubeMatrix creates a `retubematrix.cmd` shim in the current user's WindowsApps command
directory. Open a new PowerShell or Command Prompt window after installing.

If Windows reports that `retubematrix` is not recognized, check the CLI card in
Settings. The WindowsApps command directory shown there must be present in
`PATH`.

### Linux

The `.deb` package installs `/usr/bin/retubematrix`. For AppImage-style usage, RETubeMatrix
creates a `~/.local/bin/retubematrix` symlink when installing from Settings.

Make sure the displayed install directory is in `PATH`.

### Check

```powershell
retubematrix -V
retubematrix --help
retubematrix "https://www.youtube.com/watch?v=3TE5aR7EHus" --quality 720
```

## Options

| Flag                          | Alias | Description                                                                          |
| ----------------------------- | ----- | ------------------------------------------------------------------------------------ |
| `<url>` (positional)          |       | Video URL to download                                                                |
| `--url <url>`                 | `-u`  | Video URL (alternative to positional)                                                |
| `--quality <q>`               | `-q`  | Video: `best`, `8k`, `4k`, `2k`, `1080`, `720`, `480`, `360`. Audio: `128` or `auto` |
| `--output <dir>`              | `-o`  | Absolute output folder for this queued download                                      |
| `--audio`                     | `-a`  | Download audio only                                                                  |
| `--queue-only`                |       | Add to queue without starting the download                                           |
| `--target <t>`                | `-t`  | Routing: `auto` (default), `youtube`, `universal`                                    |
| `--skip-live`                 |       | Skip live, scheduled, or was-live videos before downloading                          |
| `--playlist`                  |       | Allow yt-dlp to download playlist URLs                                               |
| `--no-playlist`               |       | Force single-video download for playlist URLs                                        |
| `--subtitle-mode <mode>`      |       | Subtitle mode: `off`, `auto`, `manual`                                               |
| `--subtitle-langs <langs>`    |       | Comma-separated subtitle languages, e.g. `en,vi,ja`                                  |
| `--subtitle-format <fmt>`     |       | Subtitle format: `srt`, `vtt`, `ass`                                                 |
| `--embed-subs`                |       | Embed subtitles into the output file                                                 |
| `--download-sections <range>` |       | Download a time range, e.g. `00:30-02:10`                                            |
| `--live-from-start`           |       | Download livestreams from the beginning                                              |
| `--help`                      | `-h`  | Show help                                                                            |
| `--version`                   | `-V`  | Show version                                                                         |

Unknown or out-of-allowlist values are ignored and fall back to defaults. Output
folders must be absolute paths, including Unix paths like `/Users/me/Videos`,
Windows paths like `C:\Users\me\Videos`, or UNC paths like `\\server\share`.
Only public `http`/`https` URLs are accepted; local/private URLs are rejected.

## Examples

```sh
# Download a video at default quality
retubematrix https://www.youtube.com/watch?v=3TE5aR7EHus

# Download 720p
retubematrix --url "https://www.youtube.com/watch?v=3TE5aR7EHus" --quality 720

# Save this queued download to a specific folder
retubematrix "https://www.youtube.com/watch?v=3TE5aR7EHus" --output "/Users/me/Videos"

# Audio only
retubematrix -a "https://www.youtube.com/watch?v=3TE5aR7EHus"

# Add to the queue without starting
retubematrix --queue-only "https://vimeo.com/123456789"

# Skip live, scheduled, and was-live videos
retubematrix --skip-live "https://www.youtube.com/watch?v=3TE5aR7EHus"

# Download subtitles for selected languages
retubematrix "https://www.youtube.com/watch?v=3TE5aR7EHus" --subtitle-mode manual --subtitle-langs en,vi --subtitle-format srt

# Download only a section
retubematrix "https://www.youtube.com/watch?v=3TE5aR7EHus" --download-sections 00:30-02:10
```

## Notes

- The CLI sends a structured local request to RETubeMatrix. The browser extension
  still uses the separate `retubematrix://download` deep-link contract.
- RETubeMatrix remains a GUI/tray application. CLI URL requests are handled in the
  background and do not force the main window to open.
- Linux users no longer need to manually register the `retubematrix://` MIME handler
  just to pass URLs from a script.
