# DHE File Format Specification (Dietz X-clusive PROFI / Profi Soundbox)

Status: **draft / partial**

This document describes the binary format of `.DHE` sound files used by
Dietz X-clusive PROFI and Profi Soundbox sound modules. These files contain
16-bit mono audio at 22,050 Hz and metadata for model railway sound modules
connected via the SUSI bus.

The format is proprietary and undocumented. This specification was derived
by hex analysis of 8 sample files, cross-referencing the Dietz X-clusive
PROFI and Profi Soundbox manuals.

---

## Overview

| Property        | Value                                          |
|-----------------|------------------------------------------------|
| Extension       | `.DHE`                                         |
| Magic number    | `22 57` (raw bytes at offset 0)                |
| Format tag      | `FF FF` (raw bytes at offset 2)                |
| Audio format    | 16-bit unsigned PCM, mono, 22,050 Hz           |
| Max duration    | ~380 seconds                                   |
| Max sounds      | Up to 99 individually switchable sounds        |
| Flash           | 128 Mbit (16 MB = 16,777,216 bytes)            |
| XOR encoding    | Header AND audio use byte XOR (offset & 0xFF)  |
| Modules         | X-clusive PROFI, Profi Soundbox                |

The X-clusive PROFI supports 9 simultaneous playback channels.

---

## XOR scrambling

The same XOR scheme as IntelliSound (DS3/DS6) is used: each byte at file
offset N is stored as `value XOR (N & 0xFF)`. The key repeats every 256
bytes. Both the header and audio data are XOR-encoded.

The magic number and format tag at offset 0–3 are effectively unscrambled
because the XOR key at offset 0 is `0x00`.

For 16-bit audio at 22,050 Hz, the XOR pattern repeats every 128 samples
(~5.8 ms). The artefact amplitude is limited to the low byte (max ±255),
which is small relative to the 16-bit dynamic range. This makes the
standard 8-bit smoothness-based detection (as used for IntelliSound)
unreliable for DHE files — the XOR perturbation is too small to
distinguish statistically, but clearly audible when played back without
decoding.

To produce playable audio from a DHE file:
1. XOR-decode each byte: `decoded = raw[offset] ^ (offset & 0xFF)`
2. Convert from unsigned to signed 16-bit: XOR each sample with 0x8000
   (equivalently, flip bit 7 of every high byte in LE representation)

---

## Overall layout

| Offset    | Length      | Description                                      |
|-----------|-------------|--------------------------------------------------|
| 0x000     | 2           | Magic number: `22 57`                            |
| 0x002     | 2           | Format tag: `FF FF`                              |
| 0x004     | 10          | File metadata (XOR-encoded)                      |
| 0x00E     | 30          | Padding (`FF`)                                   |
| 0x02C     | 16          | Embedded sound name (ASCII, space-padded, XOR)   |
| 0x03C     | 8           | Post-name metadata (XOR-encoded)                 |
| 0x044     | 60          | Padding (`FF`)                                   |
| 0x080     | 20          | Configuration block 1 (XOR-encoded)              |
| 0x094     | 44          | Padding (`FF`)                                   |
| 0x0C0     | 33          | Configuration block 2 (XOR-encoded)              |
| 0x0E1     | 31          | Padding (`FF`)                                   |
| 0x100     | variable    | Track index table (XOR-encoded)                  |
| variable  | to 0x3FF    | Padding (`FF`)                                   |
| 0x400     | 360         | Per-sound configuration (XOR-encoded)            |
| 0x568     | 152         | Padding (`FF`)                                   |
| 0x600     | to EOF      | Audio data (16-bit unsigned PCM, XOR-encoded)     |

Audio data begins at offset 0x600. The first track address observed is
0x000F00 (3,840) for non-steam files and 0x002D00 (11,520) for steam
files, so the region 0x600–first_track is pre-audio silence or padding.

---

## File metadata (offset 0x004)

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

### Locomotive type (offset 0x006)

| Value | Type                           | Example files                     |
|-------|--------------------------------|-----------------------------------|
| 1     | Steam locomotive               | 99-UNI, DL-095, DL-Challenger    |
| 2     | Electric locomotive / Tram     | EL-662, Strab-Uni-1, Strab-Uni-2 |
| 4     | Diesel railcar                 | VT-SKL                           |
| 32    | Railbus                        | VT-WSB ("Wismarer")              |

---

## Embedded sound name (offset 0x02C)

**16 bytes of ASCII text, XOR-encoded, space-padded (0x20).**

The sound project name, e.g. `99-UNI-1`, `DL-Challenger`, `EL-662`.
The name does not necessarily match the filename exactly.

---

## Post-name metadata (offset 0x03C)

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

> **TODO**: Bytes +0 to +2 vary per file. They could be a checksum, total
> audio length, or other file-level metadata.

---

## Configuration blocks (0x080, 0x0C0)

These XOR-encoded regions are **identical across all examined files**,
suggesting they contain factory-default CV values or template configuration.

### Configuration block 1 (offset 0x080, 20 bytes)

Decoded values: `64 78 AA 40 02 1E 14 14` followed by descending-sequence
padding (FF artefact).

As decimal: 100, 120, 170, 64, 2, 30, 20, 20.

Likely corresponds to sound parameter CVs (Bank 2/3 defaults: chuff timing,
brake thresholds, load detection, etc.).

### Configuration block 2 (offset 0x0C0, 33 bytes)

Decoded values show a repeating pattern of `64` (100) with interspersed
values: 15, 40, 75, 105, 127.

Likely corresponds to per-sound volume or dynamic range parameters.

---

## Track index table (offset 0x100)

**Variable-length table of 3-byte XOR-encoded entries in pairs, terminated
by a fixed 2-byte sentinel.**

### Structure

```
┌─────────────────────────────────────────────────────┐
│ Pair 0: start_addr (3 bytes), loop_addr (3 bytes)   │
│ Pair 1: start_addr (3 bytes), loop_addr (3 bytes)   │
│ ...                                                  │
│ Pair N-1: start_addr (3 bytes), loop_addr (3 bytes)  │
│ Terminator: 0x47 0x0C (2 bytes decoded)              │
│ Padding: FF FF FF ... to end of region               │
└─────────────────────────────────────────────────────┘
```

Each 3-byte entry is a **24-bit little-endian absolute file offset**,
XOR-encoded with the standard scheme.

### Entry pairs

| Entry    | Meaning                                                     |
|----------|-------------------------------------------------------------|
| Even (A) | Start address — playback begins here                       |
| Odd (B)  | Loop-back address — repeat from here after reaching the end |

When the loop-back address is a small sentinel value (less than the first
real audio address), it indicates **no looping** for that sound. Common
sentinel values observed: 256, 512, 768, 1792, 2816, 3840, 4352, 5632,
6400, 10240.

When A ≠ B and B is a valid audio offset, the sound plays from A to the
end of the sound's data, then loops from B.

### Table size by locomotive type

| Locomotive type     | Pairs observed | Examples                     |
|---------------------|----------------|------------------------------|
| Steam               | 32–35          | 99-UNI (35), DL-095 (33)    |
| Electric / Tram     | 18             | EL-662, Strab-Uni-1/2       |
| Diesel railcar      | 17–20          | VT-WSB (17), VT-SKL (20)    |

### Terminator

The table always ends with a 2-byte value that decodes to `71, 12` (0x47,
0x0C). This is constant across all examined files regardless of table size.

### Address alignment

Track addresses are **byte-aligned** (not 16-bit sample-aligned). Across
8 files, approximately 25% of addresses are odd. The playback firmware
assembles 16-bit samples starting from any byte boundary.

### Sound number mapping

> **TODO**: The mapping from pair index to sound number (as defined in the
> X-clusive PROFI manual: 1–29, 30–39, 40–47, 48–49, 50–59, etc.) has not
> been fully determined. The pair count roughly matches the number of
> populated sounds listed in each file's "wasischwas" documentation.

---

## Per-sound configuration (offset 0x400)

**360 bytes (0x400–0x567), XOR-encoded.**

After decoding, this region is mostly zeros with scattered non-zero bytes.
The non-zero values are small (typically 0–127), consistent with CV-like
parameters (volume levels, function assignments, or playback flags).

Some values match known CV defaults from the manual (e.g., 31 appears
frequently, matching function key assignments; 13 matches CV 935 config).

This region differs slightly between files, suggesting per-sound-project
configuration rather than global defaults.

> **TODO**: Map individual byte positions to specific CVs or parameters.

---

## Audio data (offset 0x600 to EOF)

### Encoding

| Property    | Value                          |
|-------------|--------------------------------|
| Format      | PCM, unsigned                  |
| Bit depth   | 16 bits per sample             |
| Channels    | 1 (mono)                       |
| Sample rate  | **22,050 Hz**                  |
| Byte order  | Little-endian                  |
| Silence     | 0x8000 (32768)                 |
| XOR-encoded | Yes (same scheme as header)    |

### Flash capacity

| Flash chip   | Capacity     | Capacity (bytes) | Max duration     |
|--------------|--------------|------------------|------------------|
| 128 Mbit     | 16 MB        | 16,777,216       | ~380 s           |

Duration = (file_size - 0x600) / (22,050 × 2) seconds.

### Audio layout

Sounds are stored contiguously in the audio region. The order of sounds
in the file does not necessarily follow the sound number order. Track
boundaries are determined solely from the track index table at 0x100.

The size of each sound is computed from the sorted list of unique start
addresses: the sound at address A extends until the next start address
(or EOF for the last sound).

---

## Sound numbering

From the X-clusive PROFI and Profi Soundbox manuals, sounds are numbered:

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

Not all sound numbers are populated in every sound project. Each project
includes a "wasischwas" document listing its specific sound allocation.

---

## CV structure

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

---

## Reference files

| File              | Size (bytes) | Loco type | Name           | Pairs |
|-------------------|-------------|-----------|----------------|-------|
| 99-UNI.DHE        | 16,409,114  | Steam (1) | 99-UNI-1       | 35    |
| DL-095.DHE        | 16,523,550  | Steam (1) | DL-095         | 33    |
| DL-Challenger.DHE | 13,883,514  | Steam (1) | DL-Challenger  | 32    |
| EL-662.DHE        | 16,250,776  | Elec. (2) | EL-662         | 18    |
| Strab-Uni-1.DHE   | 14,409,880  | Tram  (2) | Strab-uni-1    | 18    |
| Strab-Uni-2.DHE   | 14,425,844  | Tram  (2) | Strab-uni-2    | 18    |
| VT-SKL.DHE        | 15,616,780  | Diesel(4) | VT-SKL         | 20    |
| VT-WSB.DHE        | 16,412,562  | Rail. (32)| VT-"Wismarer"  | 17    |

---

## Companion files

### .CV files

Plain-text files containing CV overrides for specific sound projects.
Format: one `CV_number,value` pair per line. Example:

```
1021,000000000000000000000000000001
925,127
```

The CV number and value are separated by a comma. CV 1021 lines use a
32-character binary string to set all sub-values at once.

### "wasischwas" .doc files

Microsoft Word documents listing the sound allocation for each project:
which sound number maps to which real-world sound (whistle type, bell,
announcement text, etc.).

---

## Differences from IntelliSound (DS3/DS6)

| Feature          | IntelliSound DS3/DS6        | X-clusive PROFI DHE         |
|------------------|-----------------------------|-----------------------------|
| Magic            | `DD 33` or `E1 33`          | `22 57`                     |
| Bit depth        | 8-bit unsigned PCM          | 16-bit unsigned PCM         |
| Sample rate      | 13,021 Hz                   | 22,050 Hz                   |
| Flash            | 32/64 Mbit (4/8 MB)         | 128 Mbit (16 MB)            |
| Max duration     | ~322 s / ~640 s             | ~380 s                      |
| Channels         | 1–5 simultaneous            | Up to 9 simultaneous        |
| Primary table    | 48 entries at 0x004         | File metadata at 0x004      |
| Track index      | Primary + extended tables   | Single paired table at 0x100|
| Sound name       | DS6 only, at 0x526          | All files, at 0x02C         |
| Audio start      | 0x300 (DS3) / 0x627 (DS6)  | 0x600                       |
| XOR on audio     | Yes (all formats)           | Yes (same scheme)           |
| User sounds      | DSU: raw, not XOR-encoded   | N/A (not user-programmable) |

> **Note**: The X-clusive PROFI manual states "Profisounds können Sie nicht
> selbst neu bespielen" — sound files cannot be updated by the user. They
> are factory-programmed via the Dietz SUSI-PRU programmer.

---

## Open questions

1. **Sound number mapping**: The exact mapping from track index pair number
   to X-clusive PROFI sound number (1–112) is unknown. It likely follows
   the order in the sound numbering table but may depend on loco type.

2. **Post-name metadata bytes 0–2**: The first 3 bytes at 0x03C vary per
   file and their meaning is unknown (possibly checksum or audio length).

3. **File metadata bytes 0x00C–0x00D**: These 2 bytes vary per file.
   They may encode timing parameters or additional type information.

4. **Configuration blocks**: The exact mapping from bytes in the 0x080
   and 0x0C0 regions to SUSI CV numbers has not been determined.

5. **Per-sound config at 0x400**: The purpose of individual bytes in
   this region is unknown, though values match CV-like parameters.

---

## Source evidence

This specification was determined by:
- Hex analysis of 8 DHE files (3 steam, 1 electric, 2 tram, 2 diesel)
- Cross-referencing the Dietz X-clusive PROFI and Profi Soundbox manuals
- Comparison with the IntelliSound file format (SOUND_FILE_FORMAT.md)
- Listening test with 8 WAV variants (xsound.py) confirming audio is
  XOR-encoded unsigned 16-bit PCM (the `shift-xor` variant was correct)
- Cross-file comparison of all header and track table entries
- Duration analysis: 16-bit at 22,050 Hz gives ~372s, matching 380s spec
- Address alignment analysis: ~25% odd addresses across all files
