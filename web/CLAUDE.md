# Web Editor — CLAUDE.md

## What this is

Vue 3 + TypeScript single-page app for viewing and editing IntelliSound sound files (.DS3, .DX4, .DSU, .DS6). Deployed to GitHub Pages via CI.

## Commands

```bash
npm run dev       # Dev server (Vite)
npm run build     # Type-check (vue-tsc) + production build
npm run test      # Run tests (vitest)
```

## Architecture

```
src/
  lib/           Pure functions, no framework dependencies
    parser.ts      Binary → SoundFile (all formats)
    serializer.ts  SoundFile → binary (all formats)
    xor.ts         XOR scrambling/descrambling
    constants.ts   Header offsets, SAMPLE_RATE (13021)
    audio.ts       Web Audio playback (8-bit unsigned PCM)
    wav-import.ts  WAV/MP3 → 8-bit unsigned mono PCM at 13021 Hz
    crc32.ts       CRC32 for track fingerprinting
    track-utils.ts Duration formatting
  types/
    sound-file.ts  SoundFile, Track, TrackTable, TrackTableKind
  composables/   Vue composables (stateful)
    useSoundFile.ts  File load/export, flash usage tracking
    useCopyPaste.ts  Cross-pane track selection
    useAudioPlayer.ts Track playback state
  components/    Vue SFCs
    FilePane.vue     Top-level per-file container (load, export, overwrite, import)
    TrackTable.vue   Renders one track table (primary, extended, middle, etc.)
    TrackRow.vue     Single track row (play, select, overwrite, import WAV/MP3)
    FileToolbar.vue  Load/export buttons + error display
    FlashUsageBar.vue Flash capacity bar
```

## Key domain concepts

- **SoundFile**: parsed representation of a .DS3/.DX4/.DSU/.DS6 binary file
- **Track**: one audio clip — `{ audio: Uint8Array, loopOffset: number, ... }`
- **TrackTable**: a group of track slots (primary, extended, middle, dsu, ds6_ext1/2/3)
- **Paired tables**: extended/middle tables store A/B entry pairs; A = start address, B = loop-back address; only A entries define track boundaries
- Audio format: 8-bit unsigned mono PCM at 13,021 Hz; silence = 0x80
- All header data is XOR-scrambled: `byte XOR (offset & 0xFF)`
- See `doc/SOUND_FILE_FORMAT.md` for the full binary format spec

## Conventions

- `lib/` code must stay framework-free (no Vue imports) — testable in isolation
- Events bubble up: TrackRow → TrackTable → FilePane (emit pattern)
- Use `SAMPLE_RATE` from constants.ts, never hardcode 13021
- The `dirty` flag on SoundFile controls whether `preAudioGap` is preserved on export (clean = byte-perfect roundtrip; dirty = gap dropped)
- Build must pass `vue-tsc --noEmit` with zero errors before merging

## Tests

Tests are in `src/lib/__tests__/`. Run with `npm run test`.

- `roundtrip.test.ts` — parses sample files, re-serializes, and verifies byte-for-byte identity
- Test data lives in `../../test_data/` (binary .DS3/.DX4/.DSU/.DS6 files, not in git)
