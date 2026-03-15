# IntelliSound Web Editor

Browser-based viewer and editor for Dietz/Uhlenbrock IntelliSound sound files.

**Live:** <https://Andrei-Errapart.github.io/SusiSoundConverter/>

## Supported formats

Load and export: `.DS3`, `.DX4`, `.DSU`, `.DS6` (and variants `.DS4`, `.DSD`). ZIP archives containing sound files are also supported — the editor extracts the sound file automatically.

## Layout

The editor shows **two panes side by side**. Each pane can load a sound file independently, allowing you to compare files and copy tracks between them.

Each pane contains:
- **File toolbar** — Load, Paste, and Export buttons, filename, format badge, dirty-flag indicator
- **Flash usage bar** — visual capacity gauge
- **Track tables** — one section per track table in the file (primary, extended, middle, etc.)

## Workflows

### Load and inspect a file

Click **Load** in either pane and pick a sound file (or a ZIP containing one). The track tables appear with all tracks listed. The flash usage bar shows how much of the device's flash memory is consumed.

### Play a track

Click **▶** on any non-empty track row to hear it. The row highlights yellow during playback. Click **■** to stop. Only one track plays at a time — starting another stops the previous one.

### Copy a track between files

1. Click a non-empty track row in one pane — it highlights **green** to indicate selection.
2. In the other pane, click **←** on the target track row to overwrite it with the selected track's audio and loop offset.
3. Press **Esc** at any time to cancel the selection.

### Paste a URL or file

Click **Paste** to load a sound file from the clipboard. The button detects the clipboard content and acts accordingly:

- **URL** — If the clipboard contains an `http://` or `https://` URL (e.g. `https://d-i-e-t-z.de/sounds/DL-USA.DS3`), the file is fetched and loaded directly. ZIP URLs are supported too.
- **Copied hyperlink** — If you copy a download link from a web page, the editor extracts the URL from the HTML and fetches it.
- **File via Ctrl+V** — If you copy a file in your OS file manager and press Ctrl+V, the file is loaded into the last-focused pane.
- **Fallback** — On browsers that restrict clipboard access (e.g. Safari), a prompt dialog asks you to paste the URL manually.

CORS note: most sound file hosting sites don't allow cross-origin requests. The editor automatically routes through CORS proxies. During local development (`npm run dev`), Vite's built-in proxy handles this without external services.

### Import a WAV or MP3 file

Click **📁** on any track row, then pick a `.wav` or `.mp3` file. The audio is automatically converted to **8-bit unsigned mono at 13,021 Hz** (the IntelliSound native format). WAV files must be 8-, 16-, or 24-bit PCM; stereo is mixed down to mono. MP3 decoding uses the browser's built-in audio decoder.

### Export

Click **Export** to download the modified file. The editor validates that total data fits within the device's flash capacity (4 MB or 8 MB depending on format) before saving. The dirty-flag indicator clears on successful export.

## Track table columns

| Column | Description |
|--------|-------------|
| **#** | Track index. For paired tables, shows `floor(index / 2)`. |
| **Size** | Audio data size in bytes. |
| **Duration** | Playback duration in seconds (size ÷ 13,021 samples/sec). |
| **Loop** | Loop offset in bytes (paired tables only). |
| **CRC32** | 8-hex-digit fingerprint of the audio data — useful for spotting duplicates. |
| **Actions** | ▶/■ play/stop, ← overwrite from selection, 📁 import from file. |

Empty track slots show dashes (–) in the data columns. Each table header shows a usage count like "12 / 48 used".

## Flash usage bar

The bar is color-coded by capacity:

| Usage | Color |
|-------|-------|
| 0–90% | Blue |
| 90–98% | Orange |
| > 98% | Red |

A label below shows exact kilobytes used, total capacity, and free space.

## Development

```bash
npm run dev       # Vite dev server with hot reload
npm run build     # Type-check (vue-tsc) + production build
npm run test      # Run Vitest test suite
```

The dev server includes a local CORS proxy at `/cors-proxy/` so that pasting download URLs works without external proxy services. Proxied requests are logged to the terminal.

Built with Vue 3, TypeScript, and Vite.
