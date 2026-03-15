# IntelliSound File Format Specification

Status: **draft / partial**

This document describes the binary formats of sound files used by
Dietz / Uhlenbrock IntelliSound modules (micro-IS3, micro-IS4, and compatible).
These files contain 8-bit mono audio at 13,021 Hz and metadata for model railway
sound decoders connected via the SUSI (Serial User Standard Interface) bus.

The formats are proprietary and undocumented. This specification was derived by
hex analysis of sample files, cross-referencing the Uhlenbrock IntelliSound 4
and Dietz micro-IS4 V2 manuals.

## Format family

All formats share the same two-byte magic (`xx 33`), header-plus-audio structure,
and XOR scrambling scheme (applied to track indices, configuration, and audio
data). They differ in header regions used and audio appended. The first magic
byte identifies the product line: `DD` for Dietz (DL-*) and `E1` for
Uhlenbrock (SB-*).

| Extension | Bit depth | Modules        | Description                          |
|-----------|-----------|----------------|--------------------------------------|
| .DSD      | 8-bit     | IS3, IS4, IS6  | Oldest format                        |
| .DS3      | 8-bit     | IS3, IS4, IS6  | Standard base sound file             |
| .DS4      | 8-bit     | IS4, IS6 only  | Adds per-sound volume                |
| .DSU      | 8-bit     | IS4 only       | DS3 + user custom sounds (200–203)   |
| .DX4      | 8-bit     | X-clusive-S V4 | DS3 + middle track index (9 pairs)   |
| .DS6      | 8-bit     | IS6 only       | Extended, 640s, 40+ sounds           |
| .DHE      | 16-bit    | X-clusive PROFI, Profi Soundbox | 16-bit 22050 Hz, 128 Mbit flash |

> **Note on DS6 "16-bit"**: The IS6 manual advertises "16 Bit Auflösung"
> and "Noise-Shaping-Technology". In practice, DS6 files store 8-bit
> unsigned PCM — the same as DS3/DX4. The 16-bit claim refers to the
> source audio quality before conversion to the 8-bit storage format.

---

## Reference files

| File             | Format | Magic | Size (bytes) | Audio (bytes) | Duration   |
|------------------|--------|-------|-------------|---------------|------------|
| Dl-001.dsd       | DSD    | DD 33 | 518,098     | 517,330       | ~39.7 s    |
| Dl-005.dsd       | DSD    | DD 33 | 464,482     | 463,714       | ~35.6 s    |
| DL-24-64-86.DSD  | DSD    | DD 33 | 523,610     | 522,842       | ~40.2 s    |
| Sb-alt.dsd       | DSD    | E1 33 | 285,896     | 285,128       | ~21.9 s    |
| Sb-neu.dsd       | DSD    | E1 33 | 456,368     | 455,600       | ~35.0 s    |
| DL-UNI1.DS3      | DS3    | DD 33 | 651,982     | 651,214       | ~50.0 s    |
| 99-Spreewald.DS3 | DS3    | DD 33 | 601,894     | 601,126       | ~46.2 s    |
| DL-USA-Holz.DS3  | DS3    | DD 33 | 563,228     | 562,460       | ~43.2 s    |
| SB-ALT.DS3       | DS3    | E1 33 | 435,300     | 434,532       | ~33.4 s    |
| demoproj.DSU     | DSU    | DD 33 | 779,615     | 778,847       | ~59.8 s    |
| 99-003.DX4       | DX4    | DD 33 | 1,717,937   | 1,717,169     | ~131.9 s   |
| DL-USA.DX4       | DX4    | DD 33 | 1,685,027   | 1,684,259     | ~129.3 s   |
| 99-Stainz.DS6    | DS6    | DD 33 | 3,053,350   | 3,051,775     | ~234.4 s   |
| 99-UNI-1.DS6     | DS6    | DD 33 | 3,151,731   | 3,150,156     | ~241.9 s   |
| DL-Mogul-Holz.DS6| DS6    | DD 33 | 2,961,857   | 2,960,282     | ~227.3 s   |

Duration = audio bytes / 13,021 Hz.
DS6 audio offset: 0x627. DS3/DX4 audio offset: 0x300.

---

## Overall layout

### DS3 / DX4

| Offset | Length | DS3                                             | DX4                                           |
|--------|--------|-------------------------------------------------|-----------------------------------------------|
| 0x000  | 2      | Magic number: `DD 33` or `E1 33`                | (same)                                        |
| 0x002  | 2      | Format tag: `FF FF`                             | (same)                                        |
| 0x004  | 144    | Primary track index (48 × 3-byte entries)       | (same)                                        |
| 0x094  | 22     | Padding (`FF`)                                  | Middle track index, part 1                    |
| 0x0AA  | 36     | Reserved (`FF`); repurposed by DSU              | Middle track index, part 2 (+ 4 bytes `FF`)   |
| 0x0CE  | 50     | Configuration / CV data (XOR-encoded)           | (same)                                        |
| 0x100  | 120    | Extended track index (40 × 3-byte entries)      | (same)                                        |
| 0x178  | 392    | Padding (`FF`)                                  | (same)                                        |
| 0x300  | to EOF | Audio data (XOR-encoded)                        | (same)                                        |

Total header size: **768 bytes** (0x300).

> **Pre-audio gap**: In some files, the lowest track address is greater
> than 0x300, leaving a gap of unused bytes between the header and the
> first audio sample. This gap has no known semantic meaning and is
> likely an artefact of the authoring tool. It must be accounted for
> when computing track sizes (track 0 does not necessarily start at
> 0x300). For byte-perfect roundtrips, the gap should be preserved
> when re-exporting an unmodified file.

### DSU

A DSU file is a DS3 base file with user sound data appended and a pointer
table patched into the header:

| Offset   | Length         | Description                                    |
|----------|---------------|------------------------------------------------|
| 0x000    | 0x0AA         | DS3 header (copied verbatim from base file)    |
| 0x0AA    | 36            | User sound pointer table (12 × 3-byte LE24)   |
| 0x0CE    | 0x232         | Remainder of DS3 header (copied verbatim)      |
| 0x300    | base_audio_len| DS3 audio data (XOR-encoded, copied verbatim)  |
| base_end | variable      | User sound audio data (raw, 12 slots)          |

Total file size = DS3 base size + sum of all user sound slot sizes.

### DS6

DS6 files have a larger header (1,575 bytes vs 768) with additional track
tables. The entire file — header and audio — is XOR-encoded (see
[XOR scrambling](#xor-scrambling)).

| Offset | Length | Description                                        |
|--------|--------|----------------------------------------------------|
| 0x000  | 2      | Magic number: `DD 33` or `E1 33`                   |
| 0x002  | 2      | Format tag: `25 05`                                |
| 0x004  | 4      | Fixed metadata (decoded: `00 2B 06 00`)            |
| 0x008  | 162    | Primary track index (54 × 3-byte LE24, XOR)        |
| 0x0AA  | 36     | Padding (`FF`)                                     |
| 0x0CE  | 50     | Configuration / CV data (XOR-encoded, same as DS3) |
| 0x100  | 264    | Extended table 1 (44 pairs × 6 bytes, XOR)         |
| 0x208  | 168    | Padding (`FF`)                                     |
| 0x2B0  | 468    | Extended table 2 (78 pairs × 6 bytes, XOR)         |
| 0x484  | 12     | Padding (`FF`)                                     |
| 0x490  | 48     | Extended table 3 (8 pairs × 6 bytes, XOR)          |
| 0x4C0  | 102    | Padding (`FF`)                                     |
| 0x526  | 16     | Embedded sound name (ASCII, space-padded, XOR)     |
| 0x536  | 241    | Metadata / configuration                           |
| 0x627  | to EOF | Audio data (8-bit unsigned PCM, XOR-encoded)        |

Total header size: **1,575 bytes** (0x627).

> **Pre-audio gap**: As with DS3/DX4, some DS6 files have a gap between
> 0x627 and the lowest track address. See the DS3/DX4 note above.

Each pair in the extended tables consists of two consecutive 3-byte entries
(A and B). In most cases A == B. When A ≠ B, A is the start address and
B is the loop-back address (same semantics as DX4 middle table pairs).

Unused pair slots in extended table 2 use sentinel addresses that increment
by 1 from a boundary value, resulting in zero-length (1-byte) entries.

### Notes

- All header regions are fixed-size; unused entries are filled with `FF`.

---

## XOR scrambling

All track index entries and the configuration region use the same XOR
scheme: each byte at file offset N is stored as `value XOR (N & 0xFF)`.

In all formats, the track indices, configuration region, and **audio
data** are XOR-encoded. The magic number and format tag are stored raw
(the XOR key at offset 0 is `0x00`, so the first byte is unchanged;
the format tag values were chosen to encode correctly at offsets 2–3).
Padding bytes (`FF`) are not meaningful after XOR decoding.

The only exception is **DSU user sound data**: audio appended by the
SUSI-SoundManager is stored raw (not XOR-encoded), since it is copied
verbatim from WAV files. The original DS3 audio region within a DSU
file remains XOR-encoded.

To decode a 3-byte entry at file offset `base`:

```
decoded[0] = raw[base+0] XOR ((base+0) & 0xFF)
decoded[1] = raw[base+1] XOR ((base+1) & 0xFF)
decoded[2] = raw[base+2] XOR ((base+2) & 0xFF)
address    = decoded[0] + decoded[1]*256 + decoded[2]*65536
```

For example, in `DL-UNI1.DS3`, entry 0 at offset 0x004 contains raw
bytes `04 06 06`. Decoding: `04^04=00`, `06^05=03`, `06^06=00` →
address 0x000300 = 768, which is exactly the start of the audio region.

Entries for absent sounds are filled with raw `FF FF FF` (not XOR'd).
A run of `FF` in the raw file XOR-decodes to a descending sequence
(e.g. at 0x094: FF^94=6B, FF^95=6A, ...) — this is a harmless artefact
of the encoding, not meaningful data.

---

## Magic number (offset 0x000)

```
Offset  Bytes
0x000   DD 33     — Dietz product line (DL-*)
0x000   E1 33     — Uhlenbrock product line (SB-*)
```

The second byte is always `0x33` (raw). The first byte identifies the
product line: `0xDD` for Dietz and `0xE1` for Uhlenbrock. Both values
are valid IntelliSound magic and indicate the same file format family.

Present in all IntelliSound formats (.DSD, .DS3, .DS4, .DSU, .DX4, .DS6).

## Format tag (offset 0x002)

```
Offset  Bytes
0x002   FF FF     — DS3 / DSU / DX4
0x002   25 05     — DS6
```

The format tag distinguishes DS6 from DS3/DX4/DSU.

---

## Primary track index (offset 0x004)

**144 bytes = 48 entries × 3 bytes each.**

Each entry is a **24-bit little-endian absolute file offset**, XOR-scrambled,
pointing to the start of a sound's audio data.

The IntelliSound system supports up to 48 sound numbers in the primary table:

- Sounds 0–39 (standard sounds: running sounds, whistle, bell, etc.)
- Sounds 92–99 (special: brake squeal, curve squeal, starting hiss, etc.)

Properties:

- The length of each sound is determined by the difference between
  consecutive decoded addresses, sorted globally across **all** tables
  (primary, middle, extended). The last entry in the primary table
  extends to the first middle or extended address, not to EOF.
- Consecutive entries with the same decoded address are **shared
  sounds** — both entries play the same audio data.
- Many files use paired entries (e.g. entries 22/23 share the same
  address), especially in entries 10–17 and 22+.

---

## Middle track index — DX4 only (offset 0x094)

**54 bytes = 18 entries × 3 bytes each = 9 pairs.**

In DS3 files, the region 0x094–0x0C9 is `FF` padding. DX4 files repurpose
this region as a third XOR-encoded track index table.

The entries use the same 3-byte XOR encoding as the primary and extended
tables. They come in pairs, like the extended table. The remaining 4 bytes
at 0x0CA–0x0CD are `FF` padding.

### Start/loop-back pairs

Unlike the extended table (where all observed pairs have identical A and B
addresses), some middle table pairs have **different A and B values**:

| File        | Pair | Addr A   | Addr B   | Difference         |
|-------------|------|----------|----------|--------------------|
| 99-003.DX4  | 4    | 0x0F7D7A | 0x1074D6 | 63,324 bytes (4.9s) |
| 99-003.DX4  | 6    | 0x12E7BA | 0x14166D | 77,491 bytes (6.0s) |
| 99-003.DX4  | 8    | 0x14A6D8 | 0x14BD6C | 5,780 bytes (0.4s)  |
| DL-USA.DX4  | 4    | 0x0BC45C | 0x0D9855 | 119,801 bytes (9.2s)|

Interpretation: **A = start address** (played once), **B = loop-back
address** (repeat from here). When A == B the entire sound loops from
the beginning.

### Audio layout in DX4

Audio data is laid out contiguously in three bands:

```
0x300 ──────────── Primary sounds (entries 0–47)
primary_max+1 ──── Middle sounds (9 pairs)
ext_min ────────── Extended sounds (20 pairs)
EOF
```

The first middle entry always equals primary_max + 1 (the byte
immediately after the last primary sound).

### Detection

To distinguish DX4 from DS3: check whether any byte in 0x094–0x0A9
is non-`FF`. If so, the file contains a middle track index (DX4).
If that region is all-`FF`, check 0x0AA–0x0CD for DSU pointers or
plain padding.

---

## Extended track index (offset 0x100)

**120 bytes = 40 entries × 3 bytes each = 20 pairs.**

Uses the same XOR encoding as the primary table. The entries come in
**pairs**: in all observed DS3 and DX4 files, each pair of entries
decodes to the same address. The 40 entries represent 20 sounds.

The pairing likely encodes start and loop-back addresses (which happen
to be identical in all observed files for this table).

**Track boundary rule for paired tables**: Only the A entry (even index)
of each pair defines a track boundary for computing audio sizes. The B
entry (odd index) is a loop-back address within the same track and does
not participate in the sorted address list used for size computation.
This applies to the extended table, the DX4 middle table, and all three
DS6 extended tables.

Used by files with many sounds (e.g. 99-Spreewald, DL-USA-Holz, all
DX4 files); all `FF` in simpler files (e.g. SB-ALT).

---

## DSU user sound pointer table (offset 0x0AA)

**36 bytes = 12 entries × 3 bytes each.** DSU only.

In the original DS3 file, the region 0x0AA–0x0CD is `FF` padding. The
DSU format repurposes it for user sound pointers. Unlike the track index
tables, DSU pointers are **NOT XOR-scrambled** — they are plain 24-bit
little-endian offsets.

### Slot ordering

The 12 entries correspond to four user sounds, three segments each:

| Entry | Sound | Segment |
|-------|-------|---------|
| 0     | 200   | Anf     |
| 1     | 200   | Loop    |
| 2     | 200   | End     |
| 3     | 201   | Anf     |
| 4     | 201   | Loop    |
| 5     | 201   | End     |
| 6     | 202   | Anf     |
| 7     | 202   | Loop    |
| 8     | 202   | End     |
| 9     | 203   | Anf     |
| 10    | 203   | Loop    |
| 11    | 203   | End     |

Each segment has a role:

| Segment | Purpose                                        |
|---------|------------------------------------------------|
| Anf     | Start — played once when the sound is triggered |
| Loop    | Loop — repeats continuously while active        |
| End     | End — played once when the sound is stopped     |

### Entry format

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

## User sound audio data (DSU only)

Immediately following the DS3 base data, the 12 slots are stored
contiguously in the same order as the pointer table. Unlike the base
DS3 audio, user sound audio is **not XOR-encoded** — it is copied
verbatim from the source WAV files (with byte clamping, see below).
Each slot contains:

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

### Audio data clamping

WAV audio bytes are copied into the DSU with two substitutions:

| WAV byte | DSU byte | Reason                                         |
|----------|----------|------------------------------------------------|
| `0x00`   | `0x01`   | `0x00` is reserved as the empty-slot marker    |
| `0xFF`   | `0xFE`   | `0xFF` is the DS3 header fill/padding value    |

All other byte values (0x01–0xFE) are copied unchanged. This clamping
has negligible effect on audio quality (±1 LSB at the extremes of the
8-bit range).

### Trailing byte

Each slot ends with a single trailing byte after the audio data (or as
the sole byte for empty slots):

| Condition              | Trailing byte | Interpretation          |
|------------------------|---------------|-------------------------|
| Anf or Loop, filled    | `0xFF`        | Sound continues         |
| End, filled            | `0x00`        | Sound terminates        |
| Any segment, empty     | `0x00`        | No sound data           |

The trailing byte signals the playback firmware whether to transition
to the next segment (Loop or End) or to stop.

### Worked example

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

---

## Configuration region (offset 0x0CE)

**50 bytes of configuration data, using the same XOR encoding as the
track index** (each byte at offset N stored as `value XOR (N & 0xFF)`).

This region is identical between 99-Spreewald and DL-USA-Holz but
differs in SB-ALT and the DX4 files, indicating it is per-file.

### Decoded values

```
DL-UNI1.DS3:
  0x0CE: 87 3C 01 FF FF 04 FF FF 2D 00 00 FF FF FF FF FF
  0x0DE: FF 04 29 2F 6B 73 D8 E0 18 20 50 56 96 9D 03 09
  0x0EE: 3E 45 AC B4 A5 A7 D4 D6 00 00 13 15 00 00 00 00
  0x0FE: 03 21

99-003.DX4:
  0x0CE: 86 81 00 FF FF 04 FF FF 02 FF 00 3C DE 32 14 83
  0x0DE: 7F 04 1C 26 5D 68 CE DE 13 1B 4B 58 96 B2 02 11
  0x0EE: 2C 42 79 88 00 00 55 59 E3 E6 42 06 05 04 03 02
  0x0FE: 02 46
```

The decoded values often come in pairs (e.g. 29/2F, 6B/73, D8/E0),
suggesting they may encode start/end parameters for sound playback
(speed ramp boundaries, volume curves, etc.). Several `FF` values
indicate unused or default parameters. Common structural bytes
include byte 5 = `04` and byte 17 = `04` across all observed files.

> **TODO**: Determine the relationship between this region and the CV table
> (CVs 897–939). The decoded values do not directly match published CV
> defaults.

---

## Embedded sound name — DS6 only (offset 0x526)

**16 bytes of ASCII text, XOR-encoded, space-padded.**

After decoding, this field contains the sound project name (e.g.
`99-Franzburg`, `99-UNI-1`, `DL-Mogul-Holz`). The name does not
necessarily match the file name.

> Note: `99-Stainz.DS6` contains the embedded name `99-Franzburg`,
> suggesting the file was derived from a different sound project.

DS3/DX4/DSU files do not have an embedded sound name.

---

## Audio data (offset 0x300 / 0x627 to EOF)

### Encoding

| Property    | Value                          |
|-------------|--------------------------------|
| Format      | PCM, unsigned                  |
| Bit depth   | 8 bits per sample              |
| Channels    | 1 (mono)                       |
| Sample rate | **13,021 Hz**                  |
| Byte order  | N/A (8-bit)                    |
| Silence     | 0x80 (128)                     |

### Sample rate

The sample rate is **13,021 Hz**, confirmed by two independent sources:

- The Dietz micro-IS4 V2 documentation specifies 13,021 Hz.
- The SUSI-SoundManager expects input WAV files at 13,021 Hz.

The sample rate is not stored in the file itself; it is a fixed
property of the IntelliSound playback hardware.

### Flash capacity

All formats are flat images destined for the sound module's flash chip:

| Flash chip   | Capacity     | Capacity (bytes) | Formats          |
|--------------|--------------|------------------|------------------|
| 32 Mbit      | 4 MB         | 4,194,304        | DS3, DX4, DSU    |
| 64 Mbit      | 8 MB         | 8,388,608        | DS6              |

At 13,021 Hz, maximum recording duration is ~322 s (32 Mbit) or
~640 s (64 Mbit).

### Audio data characteristics

- The audio is unsigned 8-bit PCM, XOR-encoded in the file (see
  [XOR scrambling](#xor-scrambling)). Each byte at file offset N is
  stored as `sample XOR (N & 0xFF)`. The XOR key repeats every 256
  bytes, which at 13,021 Hz produces a ~50.9 Hz modulation artefact
  if played without decoding.
- **Exception**: DSU user sound data (appended after the DS3 base) is
  stored raw — not XOR-encoded — because it is copied verbatim from
  WAV files by the SUSI-SoundManager.
- Byte values `0x00` and `0xFF` are avoided in DSU user sound regions
  by clamping to `0x01` and `0xFE` respectively (see above). The base
  DS3/DX4 audio data does not have this restriction.
- There are no long runs of silence (0x80) between tracks; track
  boundaries must be determined from the header index, not from the
  audio stream.
- The total audio duration is `(file_size - header_size) / 13021`,
  where header_size is 0x300 for DS3/DX4/DSU or 0x627 for DS6.

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

## Sound numbering

From the Dietz micro-IS4 V2 and Uhlenbrock IntelliSound 4 manuals:

| Number | Sound                          | Notes                    |
|--------|--------------------------------|--------------------------|
| 0      | (none / silence)               |                          |
| 1      | Bell or horn 2                 |                          |
| 2      | Whistle / horn 1               |                          |
| 3      | Running sounds (idle + drive)  | Multi-channel            |
| 4      | Uncoupling / door alarm        |                          |
| 5      | Conductor whistle, short       |                          |
| 6      | Station announcement           |                          |
| 7      | (reserved)                     |                          |
| 8      | Fader (all sounds on/off)      |                          |
| 9      | Coupling / pantograph          |                          |
| 10     | (reserved)                     |                          |
| 11     | Departure announcement         |                          |
| 12     | Conductor whistle, long        |                          |
| 13     | Injector / compressed air      |                          |
| 14     | Coal shovelling / door closing |                          |
| 15     | Pump / compressor              |                          |
| 16     | Warning whistle                | Auto-trigger via CV 933A |
| 17     | Blow off                       |                          |
| 18     | Vibrator (reserved)            |                          |
| 19     | Shunting notice                |                          |
| 20     | Announcement 2                 |                          |
| 21     | Braking air                    |                          |
| 22–39  | Module-specific extras         | Varies by sound file     |
| 92     | Brake squealing (manual)       |                          |
| 93     | Curve squealing (manual)       |                          |
| 95     | Smoke generator always on      |                          |
| 96     | Smoke generator always off     |                          |
| 97     | Brake sounds off by function   |                          |
| 98     | Exhaust (E-loco) / fan         |                          |
| 99     | Starting hiss (steam loco)     | Auto-trigger via CV 934A |
| 200–203| Custom user sounds (DSU only)  | IS4/IS6 only             |

---

## DSP project file

The SUSI-SoundManager uses a `.DSP` project file (INI format) to define
which WAV files go into each DSU slot:

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

## Source evidence

This specification was determined by:
- Hex analysis of DS3, DSU, DX4, and DS6 sample files
- Cross-referencing the Uhlenbrock IntelliSound 4 and Dietz micro-IS4 V2 manuals
- Byte-level comparison of DS3 input (`DL-UNI1.DS3`, 651,982 bytes)
  with DSU output (`demoproj.DSU`, 779,615 bytes)
- Comparison of DS3 and DX4 header structures
- Hex analysis of three DS6 files (`99-Stainz.DS6`, `99-UNI-1.DS6`,
  `DL-Mogul-Holz.DS6`) confirming 8-bit audio, XOR-encoded body, and
  extended header layout
- Intelli Sound Creator manual (English, 2015) — sound event to entry
  mapping, CV parameter documentation, steam chuff layout, manual
  transmission gear mapping
- Hex analysis of five DSD files (Dl-001, Dl-005, DL-24-64-86, Sb-alt,
  Sb-neu) confirming DSD is structurally identical to DS3 and that magic
  byte `E1` identifies Uhlenbrock (SB-*) product line
- Hex analysis of 8 DHE files (3 steam, 1 electric, 2 tram, 2 diesel)
  confirming 16-bit audio, 0x2000 header size, 11-byte track records at 0x800
- Cross-referencing the Dietz X-clusive PROFI and Profi Soundbox manuals
- Listening test with WAV variants confirming audio is XOR-encoded unsigned
  16-bit PCM (shift-xor variant correct)
- Cross-file comparison of all DHE header and track table entries

---

## Resolved questions

Based on the *Intelli Sound Creator* manual (English, 2015), several
previously open questions have been clarified.

### 1. Sound number to entry mapping

**Confirmed**: the mapping is direct. `entry_index = sound_number` for
sounds 0–39, and `entry_index = sound_number - 52` for sounds 92–99
(i.e. 92→40, 93→41, …, 99→47).

The IntelliSound Creator's "additional sounds" table shows sounds with
explicit "sndfl" (sound file) numbers that match the primary table
entry indices:

| Sound name                  | sndfl | Primary entry |
|-----------------------------|-------|---------------|
| Sound 1 (horn/bell)         | 1     | 1             |
| Sound 2 (whistle)           | 2     | 2             |
| Sound 3                     | 4     | 4             |
| Sound 4                     | 5     | 5             |
| Sound 5                     | 6     | 6             |
| Fct on/off sound            | 9     | 9             |
| Sound 6                     | 11    | 11            |
| Sound 7                     | 12    | 12            |
| Timer 1                     | 13    | 13            |
| Timer 2                     | 14    | 14            |
| Timer 3                     | 15    | 15            |
| Sound while starting drive  | 16    | 16            |
| Timer 4                     | 17    | 17            |
| Sound 8                     | 18    | 18            |
| Timer 5                     | 19    | 19            |
| Sound 9                     | 20    | 20            |
| Sound 10                    | 21    | 21            |
| Curve squeaking              | 93    | 41            |

Sounds 0, 3, 7, 8, 10, 22–39, and 92, 94–99 are used by the driving
sound engine (standing, start, driving, stop, etc.) and vary by
locomotive type.

### 2. Extended table pair semantics

**Confirmed**: the pairs are start/loop-back address pairs, same as the
DX4 middle table. When A == B, the sound loops from the beginning.

The extended table's 20 pairs map to **steam locomotive exhaust blow
sounds**. The IntelliSound Creator's steam loco UI shows exactly 20
driving sounds for a 2-cylinder steam locomotive:

| Pairs | Driving state      | Sounds                                    |
|-------|--------------------|-------------------------------------------|
| 4     | Load               | cylinder 1a, 1b, 2a, 2b                   |
| 4     | Load → normal      | cylinder 1a, 1b, 2a, 2b                   |
| 4     | Normal             | cylinder 1a, 1b, 2a, 2b                   |
| 4     | Normal → idle      | cylinder 1a, 1b, 2a, 2b                   |
| 4     | Idle               | cylinder 1a, 1b, 2a, 2b                   |

Each cylinder sound can have distinct start and loop-back points.

### 3. Configuration region semantics — CV mapping

**Partially resolved**. The IntelliSound Creator documents extensive
CV-to-parameter mappings for the configuration region. The CVs use
SUSI numbering (CV 900–939) and control playback behaviour:

**Volumes** (CVs with 'b' suffix):
- CV900b: Volume steam chuff
- CV901b–938b: Per-sound volumes (sounds 1–38)
- CV903b: Volume engine sound
- CV933b: Volume curve squeaking
- CV936b: Volume switching click (electric loco)
- CV937b: Volume brake squeaking

**Engine/driving parameters** (CVs with 'a' or 'c' suffix):
- CV900c: Diesel engine ramp after idle state (deceleration per speed step, 4ms units)
- CV901c–906c: Speed step to switch to gear 2–7 (manual transmission)
- CV914c–920c: Pull range for gear 1–7
- CV927a: Load time activated by acceleration / increasing load
- CV927c–933c: Time ramp in gear 1–7 (inertia, value × 4ms per speed step)
- CV934a: Standing time for automatic start sound (0 = 1s, 255 = no start sound)

**Thresholds and triggers**:
- CV919a Bit0: Idle state if speed step = 0
- CV919a Bit1: Brake squealing ends with speed > 0
- CV922a: Speed step for starting curve squeaking
- CV923a: Speed step for stopping curve squeaking
- CV924a: Function key for switching off curve squeaking (31 = always on)
- CV933a: Waiting time for automatic start of sound #16
- CV935 Bit0: Exhaust blow only via reed input
- CV935 Bit1: Exhaust blow auto and via reed input
- CV936: Threshold brake squealing (255 = no brake squeaking)
- CV936a: Threshold load recognition "slower"
- CV937: Idle state time in seconds (0 = off, 255 = always on)
- CV937a: Sensitivity to load changes
- CV938: Time between two steam chuffs at max speed
- CV938a: Threshold if motor load increases (128 = no trigger)
- CV939: Time between two steam chuffs at min speed
- CV939a: Threshold if motor load decreases (128 = no trigger)

**Smoke generator** (electric output SA1):
- CV929a: Smoke output while standing (%)
- CV930a: Smoke output while driving (%)
- CV931a: Smoke output during engine idle / during start (%)
- CV934: Fan switching on threshold (electric loco)

**Function key assignments** (CV903–931 range): multiple CVs share this
range, each assigning a function key (F0–F28) to a sound event
(engine on/off, start sound manually, brake squealing off, fan, smoke
always on/off, etc.).

> **TODO**: The exact byte-to-CV mapping within the 50-byte region at
> 0xCE–0xFF has not been fully determined. The 'a', 'b', 'c' suffixes
> suggest sub-byte or paired addressing. Comparison of decoded config
> bytes with default CV values from the manual could resolve this.

### 6. DX4 middle table sound mapping

**Resolved**. The IntelliSound Creator's "diesel locomotive with manual
transmission" mode shows exactly 9 driving sounds that correspond to
the 9 pairs in the middle table:

| Pair | Sound                    |
|------|--------------------------|
| 0    | 1st gear                 |
| 1    | 1st → 2nd gear           |
| 2    | 2nd → 1st gear           |
| 3    | 2nd gear                 |
| 4    | 2nd → 3rd gear           |
| 5    | 3rd → 2nd gear           |
| 6    | 3rd gear                 |
| 7    | Stop                     |
| 8    | Driving to idle state    |

The transmission settings (CV901c–906c) define the speed steps at
which gear shifts occur, and pull range per gear (CV914c–920c) controls
maximum playback speed-up in each gear. Up to 7 gears are supported,
though 3 gears are typical.

---

## DHE format (X-clusive PROFI / Profi Soundbox)

DHE files are used by the X-clusive PROFI-SOUND and Profi Soundbox products.
They use a different audio encoding from the IntelliSound family: **16-bit
signed PCM at 22,050 Hz** (mono), stored in an XOR-scrambled flat flash image.

The X-clusive PROFI supports 9 simultaneous playback channels. Sound files
cannot be updated by the user — they are factory-programmed via the Dietz
SUSI-PRU programmer.

### Reference files

| File              | Size (bytes) | Audio (bytes) | Duration | Loco type  | Pairs |
|-------------------|-------------|---------------|----------|------------|-------|
| 99-UNI.DHE        | 16,409,114  | 16,400,922    | ~372.1 s | Steam (1)  | 35    |
| DL-095.DHE        | 16,523,550  | 16,515,358    | ~374.7 s | Steam (1)  | 33    |
| DL-Challenger.DHE | 13,883,514  | 13,875,322    | ~314.7 s | Steam (1)  | 32    |
| EL-662.DHE        | 16,250,776  | 16,242,584    | ~368.5 s | Elec. (2)  | 18    |
| Strab-Uni-1.DHE   | 14,409,880  | 14,401,688    | ~326.6 s | Tram  (2)  | 18    |
| Strab-Uni-2.DHE   | 14,425,844  | 14,417,652    | ~327.0 s | Tram  (2)  | 18    |
| VT-SKL.DHE        | 15,616,780  | 15,608,588    | ~354.1 s | Diesel (4) | 20    |
| VT-WSB.DHE        | 16,412,562  | 16,404,370    | ~372.2 s | Rail. (32) | 17    |

Duration = (file_size − 0x2000) / 2 / 22,050 Hz.

### Overall layout

| Offset  | Length   | Description                                          |
|---------|----------|------------------------------------------------------|
| 0x0000  | 2        | Magic number: `22 57` (raw)                          |
| 0x0002  | 2        | Format tag: `FF FF`                                  |
| 0x0004  | 10       | File metadata (XOR-encoded)                          |
| 0x000E  | 30       | Padding (`FF`)                                       |
| 0x002C  | 16       | Embedded sound name (ASCII, space-padded, XOR)       |
| 0x003C  | 8        | Post-name metadata (XOR-encoded)                     |
| 0x0044  | 60       | Padding (`FF`)                                       |
| 0x0080  | 20       | Configuration block 1 (XOR-encoded)                  |
| 0x0094  | 44       | Padding (`FF`)                                       |
| 0x00C0  | 33       | Configuration block 2 (XOR-encoded)                  |
| 0x00E1  | 31       | Padding (`FF`)                                       |
| 0x0100  | variable | Legacy index (3-byte XOR entries, same as DS3)       |
| variable| to 0x3FF | Padding (`FF`)                                       |
| 0x0400  | 360      | Per-sound configuration (XOR-encoded)                |
| 0x0568  | 664      | Padding (`FF`)                                       |
| 0x0800  | variable | Track index table (11-byte records, XOR-encoded)     |
| variable| to 0x1FFF| Padding (`FF`)                                       |
| 0x2000  | to EOF   | Audio data (16-bit signed PCM, XOR-encoded)          |

Total header size: **8,192 bytes** (0x2000).

### XOR scrambling

The same byte-offset XOR scheme as the IntelliSound family is used (see
[XOR scrambling](#xor-scrambling) above). Both the header and audio data
are XOR-encoded.

To produce playable audio from a DHE file:
1. XOR-decode each byte: `decoded = raw[offset] ^ (offset & 0xFF)`
2. Convert from unsigned to signed 16-bit: XOR each sample with 0x8000
   (equivalently, flip bit 7 of every high byte in LE representation)

### File metadata (offset 0x004)

**10 bytes, XOR-encoded.**

| Offset | Size | Description                        | Values observed            |
|--------|------|------------------------------------|----------------------------|
| 0x004  | 1    | Constant                           | Always 16 (0x10)           |
| 0x005  | 1    | Constant                           | Always 32 (0x20)           |
| 0x006  | 1    | Locomotive type                    | See table below            |
| 0x007  | 1    | Zero padding                       | Always 0                   |
| 0x008  | 1    | Sound parameter                    | 45 (steam) or 15 (others)  |
| 0x009  | 1    | Zero padding                       | Always 0                   |
| 0x00A  | 1    | Constant                           | Always 25 (0x19)           |
| 0x00B  | 1    | Zero padding                       | Always 0                   |
| 0x00C  | 1    | File-specific parameter            | Varies (8–208)             |
| 0x00D  | 1    | File-specific parameter            | Varies (7–11)              |

#### Locomotive type (offset 0x006)

| Value | Type                           | Example files                     |
|-------|--------------------------------|-----------------------------------|
| 1     | Steam locomotive               | 99-UNI, DL-095, DL-Challenger    |
| 2     | Electric locomotive / Tram     | EL-662, Strab-Uni-1, Strab-Uni-2 |
| 4     | Diesel railcar                 | VT-SKL                           |
| 32    | Railbus                        | VT-WSB ("Wismarer")              |

### Embedded sound name (offset 0x02C)

**16 bytes of ASCII text, XOR-encoded, space-padded (0x20).**

The sound project name, e.g. `99-UNI-1`, `DL-Challenger`, `EL-662`.
The name does not necessarily match the filename exactly.

### Post-name metadata (offset 0x03C)

**8 bytes, XOR-encoded.**

| Byte | Description           | Values observed                        |
|------|-----------------------|----------------------------------------|
| +0   | File-specific         | Varies widely                          |
| +1   | File-specific         | Varies widely                          |
| +2   | File-specific         | Varies widely                          |
| +3   | Constant              | Always 0x00                            |
| +4   | Sub-type indicator    | 0x10 (steam) or 0x12 (non-steam)      |
| +5   | Sub-version?          | 2, 3, or 5                             |
| +6   | Unknown               | 0x0A or 0x0B                           |
| +7   | Constant              | Always 0xBC (188)                      |

### Configuration blocks (0x080, 0x0C0)

These XOR-encoded regions are **identical across all examined files**,
suggesting they contain factory-default CV values or template configuration.

**Configuration block 1 (offset 0x080, 20 bytes)**: decoded values
`64 78 AA 40 02 1E 14 14` (as decimal: 100, 120, 170, 64, 2, 30, 20, 20)
followed by padding. Likely corresponds to sound parameter CVs (chuff
timing, brake thresholds, load detection, etc.).

**Configuration block 2 (offset 0x0C0, 33 bytes)**: decoded values show a
repeating pattern of `64` (100) with interspersed values: 15, 40, 75, 105,
127. Likely corresponds to per-sound volume or dynamic range parameters.

### Track index table (offset 0x800)

The real track index is at **0x800** in the XOR-decoded header, containing
**11-byte records**. The legacy table at 0x100 uses 3-byte entries (like
DS3) but its decoded addresses point below 0x2000 and are incorrect.

#### Record format (11 bytes)

```
Bytes 0–2:  Address A (LE24) — primary start address
Bytes 3–5:  Address B (LE24) — loop-back address (= A when no loop offset)
Bytes 6–8:  Address C (LE24) — end/section address (= A in most records)
Byte  9:    Flag 1
Byte 10:    Flag 2
```

#### Flag byte 9 values

| Value | Meaning                                                    |
|-------|------------------------------------------------------------|
| 0x00  | Paired entry (typically followed by another record at A+2) |
| 0xFF  | Standalone or end-of-pair                                  |
| 0x04  | Section start (C ≠ A, C may indicate section end address)  |
| 0x03  | Similar to 0x04 (observed with C ≠ A)                      |

#### Pairing and sentinel runs

Records often come in pairs where the second record's address A is the
first's A + 2 (one sample offset). Some track positions have runs of
many consecutive +2 entries (sentinel padding), similar to the
IntelliSound extended table sentinel pattern.

In 99-UNI.DHE the table contains 359 real records (68 unique track
positions) before padding. Padding consists of descending-byte sequences
resulting from XOR-decoding raw 0xFF fill bytes.

When B ≠ A, B is a **loop-back address** within the track (the sound
plays from A to the end, then loops back to B). When C ≠ A (with flag
0x04 or 0x03), C appears to indicate a section end or related address.

#### Table size by locomotive type

| Locomotive type     | Pairs observed | Examples                     |
|---------------------|----------------|------------------------------|
| Steam               | 32–35          | 99-UNI (35), DL-095 (33)    |
| Electric / Tram     | 18             | EL-662, Strab-Uni-1/2       |
| Diesel railcar      | 17–20          | VT-WSB (17), VT-SKL (20)    |

#### Address alignment

Track addresses are **byte-aligned** (not 16-bit sample-aligned). Across
8 files, approximately 25% of addresses are odd. The playback firmware
assembles 16-bit samples starting from any byte boundary.

### Per-sound configuration (offset 0x400)

**360 bytes (0x400–0x567), XOR-encoded.**

After decoding, this region is mostly zeros with scattered non-zero bytes.
The non-zero values are small (typically 0–127), consistent with CV-like
parameters (volume levels, function assignments, or playback flags).

Some values match known CV defaults from the manual (e.g., 31 appears
frequently, matching function key assignments; 13 matches CV 935 config).
This region differs slightly between files, suggesting per-sound-project
configuration rather than global defaults.

### Audio data

| Property    | Value                          |
|-------------|--------------------------------|
| Format      | PCM, signed                    |
| Bit depth   | 16 bits per sample             |
| Channels    | 1 (mono)                       |
| Sample rate | **22,050 Hz**                  |
| Byte order  | Little-endian                  |

The audio data is XOR-scrambled using the same byte-offset scheme as the
IntelliSound family. After XOR decoding, the raw 16-bit unsigned samples
must be sign-shifted (XOR each sample's high byte with 0x80) to obtain
standard signed PCM.

Sounds are stored contiguously in the audio region. Track boundaries are
determined solely from the track index table at 0x800.

### Flash capacity

| Flash chip   | Capacity     | Capacity (bytes) |
|--------------|--------------|------------------|
| 128 Mbit     | 16 MB        | 16,777,216       |

At 22,050 Hz 16-bit mono, maximum recording duration is ~380 s.

### DHE sound numbering

From the X-clusive PROFI and Profi Soundbox manuals:

| Number   | Sound (Steam)                    | Sound (Electric)     | Sound (Diesel)       |
|----------|----------------------------------|----------------------|----------------------|
| 1        | Whistle 1                        | Whistle 1            | Whistle 1            |
| 2        | Whistle 2                        | Whistle 2            | Whistle 2            |
| 3        | Announcement "all aboard"        | (same)               | (same)               |
| 4        | Discoupler sound                 | (same)               | (same)               |
| 5        | Bell                             | (same)               | (same)               |
| 6        | Station announcement             | (same)               | (same)               |
| 7        | Unlock brakes                    | (same)               | (same)               |
| 8        | Light switch                     | (same)               | (same)               |
| 9        | Main power switch                | (same)               | (same)               |
| 10       | Short pea-whistle                | (same)               | (same)               |
| 11       | Long pea-whistle                 | (same)               | (same)               |
| 12       | Blower                           | Switch               | Auxiliary diesel     |
| 13       | Injector                         | Pantograph           |                      |
| 14       | Coal-shovelling                  | Pantograph           |                      |
| 15       | Air pump                         | Air pump             | Air pump             |
| 16       | Blow off                         | Compressed air       |                      |
| 17       | Fire grate                       | Webasto heater       |                      |
| 18       | Switching radio                  | (same)               |                      |
| 19       | Handbrake                        | (same)               |                      |
| 20       | Compressed air                   | Door sound           | Door sound           |
| 21–29    | Various per-type sounds          |                      |                      |
| 30–39    | Additional announcements         |                      |                      |
| 40–47    | Additional whistles              |                      |                      |
| 48–49    | Echoed whistle 1                 |                      |                      |
| 50–59    | Additional bells                 |                      |                      |
| 60       | Sine test tone                   |                      |                      |
| 61       | Indusi release                   |                      |                      |
| 62       | Cog-wheel entry                  |                      |                      |
| 63       | Snow-blower                      |                      |                      |
| 70       | Fast air pump                    |                      |                      |
| 71       | Work end                         |                      |                      |
| 72       | Volume change sound              |                      |                      |
| 73       | Triller whistle                  |                      |                      |
| 75       |                                  |                      | Full throttle idle   |
| 78–83    | Additional switching radio       |                      |                      |
| 84       | Door closing                     |                      |                      |
| 90       | Curve-squeaking                  |                      |                      |
| 95       | Brake announcement (train)       |                      |                      |
| 96       | Brake announcement (loco)        |                      |                      |
| 97       | Short whistle (automatic)        |                      |                      |
| 98       | Fan (automatic)                  |                      |                      |
| 99       | Discoupler + mode switch         |                      |                      |
| 101      | Standing / starting sound        |                      |                      |
| 102      | Turbo / 2nd motor                |                      |                      |
| 110      | Announcement with auto-switch    |                      |                      |
| 111–112  | Special activity sounds          |                      |                      |

Not all sound numbers are populated in every project. Each project
includes a "wasischwas" document listing its specific sound allocation.

### CV structure

The X-clusive PROFI uses SUSI CVs organized in banks (selected via CV 1021):

| Bank | CV 1021 | Purpose                                        |
|------|---------|------------------------------------------------|
| 0    | 0       | Function-to-sound mapping (CV 903–931, 933–939)|
| 1    | 1       | Function-mapping + inputs (CV 900a–939a)       |
| 2    | 2       | Sound parameters I (CV 935b–939b)              |
| 3    | 3       | Sound parameters II (CV 901c–939c)             |
| 4    | 4       | Smoke unit parameters (CV 939d)                |
| 5    | 5       | Volumes sounds 1–39 (CV 900e–939e)             |
| 6    | 6       | Volumes sounds 40–79 (CV 900f–939f)            |
| 7    | 7       | Volumes sounds 80–99 (CV 900g–922g)            |

CV 897 selects the SUSI address range (1–3).
CV 900 = 115 (manufacturer ID = DIETZ), read-only.
CV 900 = 243 triggers a factory reset.

### Differences from IntelliSound (DS3/DS6)

| Feature          | IntelliSound DS3/DS6        | X-clusive PROFI DHE         |
|------------------|-----------------------------|-----------------------------|
| Magic            | `DD 33` or `E1 33`          | `22 57`                     |
| Bit depth        | 8-bit unsigned PCM          | 16-bit unsigned PCM         |
| Sample rate      | 13,021 Hz                   | 22,050 Hz                   |
| Flash            | 32/64 Mbit (4/8 MB)         | 128 Mbit (16 MB)            |
| Max duration     | ~322 s / ~640 s             | ~380 s                      |
| Channels         | 1–5 simultaneous            | Up to 9 simultaneous        |
| Header size      | 0x300 (DS3) / 0x627 (DS6)  | 0x2000                      |
| Track index      | 3-byte entries (multiple tables) | 11-byte records at 0x800 |
| Sound name       | DS6 only, at 0x526          | All files, at 0x02C         |
| Audio start      | 0x300 (DS3) / 0x627 (DS6)  | 0x2000                      |
| XOR on audio     | Yes (all formats)           | Yes (same scheme)           |
| User sounds      | DSU: raw, not XOR-encoded   | N/A (not user-programmable) |

---

## Open questions

### IntelliSound (DS3/DX4/DSU/DS6)

1. **Configuration byte-to-CV mapping**: The exact mapping from the 50
   decoded bytes at 0xCE–0xFF to the SUSI CV numbers (with 'a', 'b', 'c'
   sub-addressing) remains unverified. The 'a'/'b' suffixes may encode
   high/low nibbles or consecutive byte pairs.

2. **DS6 extended table semantics**: Extended tables 1–3 contain 44 + 78 +
   8 = 130 pairs. Which sound numbers map to which pairs? How do the
   sentinel entries (incrementing-by-1 addresses) in table 2 interact
   with the real entries? (The IntelliSound Creator manual covers IS4
   only, not DS6/IS6.)

3. **DS6 metadata region (0x536–0x626)**: 241 bytes of unknown purpose
   between the sound name and audio data. Likely contains additional
   configuration or playback parameters.

### DHE (X-clusive PROFI / Profi Soundbox)

4. **DHE sound number mapping**: The exact mapping from track index pair
   number to X-clusive PROFI sound number (1–112) is unknown. It likely
   follows the order in the sound numbering table but may depend on
   locomotive type.

5. **DHE post-name metadata (0x03C bytes 0–2)**: These 3 bytes vary per
   file and their meaning is unknown (possibly checksum or audio length).

6. **DHE file metadata (0x00C–0x00D)**: These 2 bytes vary per file.
   They may encode timing parameters or additional type information.

7. **DHE configuration blocks**: The exact mapping from bytes in the 0x080
   and 0x0C0 regions to SUSI CV numbers has not been determined.

8. **DHE per-sound config (0x400)**: The purpose of individual bytes in
   this 360-byte region is unknown, though values match CV-like parameters.
