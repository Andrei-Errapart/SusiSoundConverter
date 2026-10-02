# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Reverse-engineering of the proprietary sound-file formats used by Dietz / Uhlenbrock model-railway SUSI sound modules (IntelliSound `.DSD/.DS3/.DS4/.DSU/.DX4/.DS6`, and X-clusive PROFI `.DHE`), plus tooling built on that knowledge. Three parts:

- `doc/SOUND_FILE_FORMAT.md` — the format specification, derived from hex analysis of sample files. This is the source of truth; it ends with an "Open questions" section.
- `src/*.zig` — two standalone CLI tools (no shared module, no dependencies):
  - `infosound [-e] FILE...` — dumps header, track tables, sizes, CRC32s for any supported format; `-e` also exports each track as WAV into the current directory.
  - `build_dsu PROJECT.dsp` — builds a `.DSU` (DS3 base + up to 12 user WAV slots) next to the `.dsp` file and prints a log to stdout.
- `web/` — Vue 3 + TypeScript two-pane editor, deployed to GitHub Pages. It has its own `web/CLAUDE.md` with its architecture and conventions; read that when working there.

The root `README.md` is written in German; keep it in German when updating it. `web/README.md` and the format spec are in English.

## Commands

```bash
zig build                                  # builds zig-out/bin/{infosound,build_dsu}
zig build info -- test_data/DL-UNI1.DS3    # build + run infosound
zig build run -- test_data/demoproj/demoproj.dsp   # build + run build_dsu

tests/run            # all tests (needs `zig build` and `npm ci` in web/ first)
tests/run 0003       # only test directories whose name starts with the prefix

cd web
npm ci
npm run test                         # vitest
npx vitest run -t "DL-UNI1.DS3"      # single roundtrip case by name
npm run build                        # vue-tsc --noEmit + vite build
npx vite                             # dev server
```

- Zig 0.16 is required (`build.zig.zon` minimum is a 0.16-dev build; CI uses `master`). The code uses the 0.16 `std.Io` API (`pub fn main(init: std.process.Init)`, `Io.Dir`, `Io.File.Writer`), so older-Zig idioms will not compile.
- `npm run dev` hardcodes `--host 192.168.178.46`; use `npx vite` when that address is not available.
- There is no root `.gitignore`, so `zig-out/` and `.zig-cache/` show up as untracked. Don't commit them.

## Tests

Each test is a directory under `tests/` with an executable `run` script; `tests/run` executes them all and is what CI runs.

- `0001_sample_files_info` — runs `infosound` on `test_data/*.{DS3,DX4,DS6,DSU,DSD}` and diffs stdout against `expected/<file>.expected` (the first `=== path ===` line is stripped). It does not cover `test_data/DEH/`.
- `0002_LoadStore` — `npx vitest run` in `web/`: parse → serialize must be byte-identical for every DS3/DX4/DSU/DS6 file in `test_data/` and every `.DHE` in `test_data/DEH/`. `.dsd` files are not included.
- `0003_build_dsu` — runs `build_dsu` on `test_data/demoproj/demoproj.dsp` and compares both the produced `.DSU` and the log with `cmp`. The log imitates the original SUSI-SoundManager byte-for-byte (CRLF line endings, German text, fixed version string), so do not "clean up" `writeLog`.

**macOS caveat:** the `normalize` function in `0001_sample_files_info/run` uses GNU sed syntax. With BSD sed it errors and yields empty output for both sides, so the test prints `OK` for every file regardless of content. It is only meaningful on Linux/CI. On macOS, check infosound output directly, e.g. `diff <(tail -n +2 tests/0001_sample_files_info/expected/X.expected) <(zig-out/bin/infosound test_data/X | tail -n +2)`.

CI (`.github/workflows/deploy-pages.yml`) on push to `main`: `zig build`, `npm ci`, `tests/run`, then `npx vite build` and deploy to Pages. CI does not run `vue-tsc`, so run `npm run build` locally to catch type errors.

## Architecture notes

**The format is implemented twice, independently.** `src/infosound.zig` (read-only dump) and `web/src/lib/{parser,serializer,constants}.ts` (read/write) each carry their own copy of the header offsets, table sizes, and detection logic. A new format finding normally means touching the spec, the Zig constants/dump code, the TS constants/parser/serializer, and the `.expected` files.

Format detection is the same in both: magic `22 57` → DHE; magic `DD 33` (Dietz) or `E1 33` (Uhlenbrock) → IntelliSound, then format tag `25 05` at offset 2 → DS6, otherwise the DS3 family. Within the DS3 family, DX4 is recognised by a non-`FF` middle table at 0x094, DSU by a pointer table at 0x0AA (the two overlap, so they are mutually exclusive), and DSD only by file extension. `00 FF` is an encrypted variant that is rejected.

Things that are easy to get wrong:

- Everything except the magic is XOR-scrambled with the low byte of the file offset (`byte ^ (offset & 0xFF)`), including audio. The exception is user audio appended to a DSU, which is stored raw; DSU pointers are plain LE24, not XOR'd.
- Track entries are 3-byte addresses with no stored length. Sizes come from sorting all addresses across tables and taking the distance to the next one (or EOF). In paired tables only the A entry is a track boundary; B is a loop-back point inside it.
- Unused entries are raw `FF FF FF`, checked before XOR-decoding.
- Some files have a gap between the end of the header and the lowest track address. The web editor keeps it (`preAudioGap`) so an unmodified file round-trips exactly, and drops it once the file is `dirty`.
- `build_dsu` clamps user audio (`0x00→0x01`, `0xFF→0xFE`) because those values are used as terminators: each filled slot ends in `0xFF` (start/loop segments) or `0x00` (end segments), and an empty slot is a single `0x00`.
- DHE is a different layout altogether: 0x2000-byte header, 11-byte track records at 0x800, 16-bit 22,050 Hz audio, 16 MB flash.

## Test data

- `test_data/` holds real sample files; the DHE samples are in `test_data/DEH/` (directory name is spelled that way; the files are `.DHE`). The `*-wasischwas.doc` and `.txt` files next to them are the vendor's sound-number listings.
- `test_data/demoproj/` is a SUSI-SoundManager project (`.dsp` INI file + WAVs + DS3 base); `test_data/demoproj.DSU` is its reference output.
- `doc/*.pdf` are vendor manuals and NMRA SUSI specs (tracked in git; `doc/download.sh` re-fetches them).
