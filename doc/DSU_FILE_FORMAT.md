# DSU File Format Specification

Status: **draft**

This document describes the binary format of `.DSU` files produced by the
Dietz **SUSI-SoundManager** tool. A DSU file adds up to four user-defined
custom sounds (sound numbers 200–203) to an existing DS3/DSD base sound
file for IntelliSound 4 (IS4) modules.

Each of the four user sounds has three segments:

| Segment | Purpose                                       |
|---------|-----------------------------------------------|
| Anf     | Start — played once when the sound is triggered |
| Loop    | Loop — repeats continuously while active       |
| End     | End — played once when the sound is stopped    |

## Source evidence

This specification was determined by:
- Byte-level comparison of a DS3 input file (`DL-UNI1.DS3`, 651,982 bytes)
  with the corresponding DSU output (`demoproj.DSU`, 779,615 bytes) produced
  by SUSIsound.EXE
- Cross-referencing with 8 input WAV files (8-bit mono PCM at 13,021 Hz)

## Overall layout

A DSU file is a DS3/DSD base file with user sound data appended and a
pointer table patched into the header:

```
Offset      Length         Description
─────────────────────────────────────────────────────────────────────
0x000       0x0AA          DS3 header (copied verbatim from base file)
0x0AA       36             User sound pointer table (12 × 3-byte entries)
0x0CE       0x232          Remainder of DS3 header (copied verbatim)
0x300       base_audio_len DS3 audio data (copied verbatim)
base_end    variable       User sound audio data (12 slots, concatenated)
```

Total file size = DS3 base size + sum of all user sound slot sizes.

---

## User sound pointer table (offset 0x0AA)

**36 bytes = 12 entries × 3 bytes each.**

In the original DS3 file, the region 0x094–0x0CD is `FF` padding between
the primary track index table and the configuration region. The DSU format
repurposes 36 bytes at 0x0AA–0x0CD for user sound pointers.

### Slot ordering

The 12 entries correspond to the four user sounds, three segments each,
in this fixed order:

| Entry | Slot | Sound | Segment |
|-------|------|-------|---------|
| 0     | 1    | 200   | Anf     |
| 1     | 2    | 200   | Loop    |
| 2     | 3    | 200   | End     |
| 3     | 4    | 201   | Anf     |
| 4     | 5    | 201   | Loop    |
| 5     | 6    | 201   | End     |
| 6     | 7    | 202   | Anf     |
| 7     | 8    | 202   | Loop    |
| 8     | 9    | 202   | End     |
| 9     | 10   | 203   | Anf     |
| 10    | 11   | 203   | Loop    |
| 11    | 12   | 203   | End     |

### Entry format

Each entry is a **24-bit unsigned integer in little-endian byte order**,
giving the absolute file offset where that slot's data begins:

```
Byte 0: offset[7:0]    (least significant)
Byte 1: offset[15:8]
Byte 2: offset[23:16]  (most significant)
```

The first entry always points to the byte immediately after the end of
the DS3 base data (i.e., the DS3 file size).

### Example

For a DS3 base of 651,982 bytes (0x09F2CE):

```
0x0AA: CE F2 09    → offset 0x09F2CE (651982) — start of slot 1 data
0x0AD: 0C FE 09    → offset 0x09FE0C (654860) — start of slot 2 data
...
```

---

## User sound audio data

Immediately following the DS3 base data, the 12 slots are stored
contiguously in the same order as the pointer table. Each slot contains:

### Filled slot (WAV file assigned)

```
┌─────────────────────────────┬──────────────┐
│ Clamped audio bytes         │ Trailing byte│
│ (WAV PCM data, N bytes)     │ (1 byte)     │
└─────────────────────────────┴──────────────┘
```

Total size: N + 1 bytes, where N is the WAV audio data length.

### Empty slot (no WAV file assigned)

```
┌──────────────┐
│ 0x00         │
│ (1 byte)     │
└──────────────┘
```

Total size: 1 byte.

---

## Audio data clamping

WAV audio bytes are copied into the DSU with two substitutions:

| WAV byte | DSU byte | Reason                                         |
|----------|----------|------------------------------------------------|
| `0x00`   | `0x01`   | `0x00` is reserved as the empty-slot marker    |
| `0xFF`   | `0xFE`   | `0xFF` is the DS3 header fill/padding value    |

All other byte values (0x01–0xFE) are copied unchanged. This clamping
has negligible effect on audio quality (±1 LSB at the extremes of the
8-bit range).

---

## Trailing byte

Each slot ends with a single trailing byte after the audio data (or as
the sole byte for empty slots):

| Condition              | Trailing byte | Interpretation          |
|------------------------|---------------|-------------------------|
| Anf or Loop, filled    | `0xFF`        | Sound continues         |
| End, filled            | `0x00`        | Sound terminates        |
| Any segment, empty     | `0x00`        | No sound data           |

The trailing byte likely signals the playback firmware whether to
transition to the next segment (Loop or End) or to stop.

---

## WAV input requirements

The SUSI-SoundManager expects input WAV files with:

| Property    | Value                |
|-------------|----------------------|
| Format      | PCM (format tag 1)   |
| Channels    | 1 (mono)             |
| Bit depth   | 8 bits per sample    |
| Sample rate | 13,021 Hz            |
| Encoding    | Unsigned             |

Only the raw audio samples from the `data` chunk are used; all WAV
metadata (headers, format chunk, etc.) is discarded.

---

## Flash capacity

The DSU file is a flat image destined for the sound module's flash chip.
The SUSI-SoundManager validates that the total DSU size fits within the
available flash:

| Flash chip   | Capacity     | Capacity (bytes) |
|--------------|--------------|------------------|
| 32 Mbit      | 4 MB         | 4,194,304        |

Free space = 4,194,304 − DSU file size.

---

## DSP project file

The SUSI-SoundManager uses a `.DSP` project file (INI format) to define
which WAV files go into each slot:

```ini
[WAVs]
DSDfilename=DL-UNI1.DS3
Sound1AnfWAV=200a-bimstart.wav
Sound1LoopWAV=200l-bimloop.wav
Sound2AnfWAV=201a-ansage.wav
Sound3AnfWAV=202a-kupplung.wav
Sound3EndWAV=202e-kupplung.wav
Sound4AnfWAV=203a-pfeife.wav
Sound4LoopWAV=203l-pfeife.wav
Sound4EndWAV=203e-pfeife.wav
```

Keys follow the pattern `Sound[1-4][Anf|Loop|End]WAV`. Missing keys
indicate empty slots. All filenames are relative to the DSP file location.

---

## Related formats

| Extension | Description                                    | Relationship to DSU          |
|-----------|------------------------------------------------|------------------------------|
| .DS3      | Base sound file (see DS3_FILE_FORMAT.md)       | Input — copied verbatim      |
| .DSD      | Older base format (same structure as DS3)      | Also valid as DSU input      |
| .DSP      | SUSI-SoundManager project file (INI text)      | Defines DSU build parameters |

---

## Worked example

Input: `DL-UNI1.DS3` (651,982 bytes) + 8 WAV files.

| Slot | Sound | Seg  | WAV file            | Audio bytes | +1  | Cumulative offset |
|------|-------|------|---------------------|-------------|-----|-------------------|
| 1    | 200   | Anf  | 200a-bimstart.wav   | 2,877       | +1  | 651,982           |
| 2    | 200   | Loop | 200l-bimloop.wav    | 4,412       | +1  | 654,860           |
| 3    | 200   | End  | (empty)             | 0           | +1  | 659,273           |
| 4    | 201   | Anf  | 201a-ansage.wav     | 76,445      | +1  | 659,274           |
| 5    | 201   | Loop | (empty)             | 0           | +1  | 735,720           |
| 6    | 201   | End  | (empty)             | 0           | +1  | 735,721           |
| 7    | 202   | Anf  | 202a-kupplung.wav   | 14,048      | +1  | 735,722           |
| 8    | 202   | Loop | (empty)             | 0           | +1  | 749,771           |
| 9    | 202   | End  | 202e-kupplung.wav   | 17,117      | +1  | 749,772           |
| 10   | 203   | Anf  | 203a-pfeife.wav     | 1,804       | +1  | 766,890           |
| 11   | 203   | Loop | 203l-pfeife.wav     | 6,193       | +1  | 768,695           |
| 12   | 203   | End  | 203e-pfeife.wav     | 4,725       | +1  | 774,889           |

Total DSU size: **779,615 bytes**.
Free flash (32 Mbit): 4,194,304 − 779,615 = **3,414,689 bytes**.
