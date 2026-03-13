# DS3 File Format Specification

Status: **draft / partially reverse-engineered**

This document describes the binary format of `.DS3` sound files used by
Dietz / Uhlenbrock IntelliSound modules (micro-IS3, micro-IS4, and compatible).
DS3 files contain 8-bit audio and metadata for model railway sound decoders
connected via the SUSI (Serial User Standard Interface) bus.

The format is proprietary and undocumented. This specification was derived by
hex analysis of sample files and cross-referencing the Uhlenbrock IntelliSound 4
and Dietz micro-IS4 V2 manuals.

## Reference files

| File             | Size (bytes) | Audio (bytes) | Duration\* |
|------------------|-------------|---------------|-----------|
| 99-Spreewald.DS3 | 601,894     | 601,126       | ~75 s     |
| DL-USA-Holz.DS3  | 563,228     | 562,460       | ~70 s     |
| SB-ALT.DS3       | 435,300     | 434,532       | ~54 s     |

\* Estimated at 8,000 Hz sample rate.

---

## Overall layout

| Offset    | Length   | Description                                    |
|-----------|----------|------------------------------------------------|
| 0x000     | 2        | Magic number: `DD 33`                          |
| 0x002     | 2        | Format tag: `FF FF` for DS3                    |
| 0x004     | 144      | Track index table (48 × 3-byte entries)        |
| 0x094     | 58       | Padding (`FF`)                                 |
| 0x0CE     | 50       | Configuration / CV data (encoded)              |
| 0x100     | 120      | Extended track index (40 × 3-byte entries)     |
| 0x178     | 392      | Padding (`FF`)                                 |
| 0x300     | to EOF   | Audio data                                     |

Total header size: **768 bytes** (0x300).

### Notes

- All header regions are fixed-size; unused entries are filled with `FF`.
- DS6 files share the same magic (`DD 33`) but have a different format tag
  (e.g. `25 05`) and a larger/different header layout.

---

## Magic number (offset 0x000)

```
Offset  Bytes
0x000   DD 33
```

Present in both DS3 and DS6 files. Identifies the file as a
Dietz/Uhlenbrock IntelliSound sound file.

## Format tag (offset 0x002)

```
Offset  Bytes
0x002   FF FF     — DS3 format
```

DS6 files use different values here (e.g. `25 05`), allowing format
identification. The exact meaning of the DS6 tag bytes is outside the
scope of this document.

---

## Track index table (offset 0x004)

**144 bytes = 48 entries × 3 bytes each.**

Each entry corresponds to one sound slot. The IntelliSound system supports
up to 48 sound numbers in the primary table:

- Sounds 0–39 (standard sounds: running sounds, whistle, bell, etc.)
- Sounds 92–99 (special: brake squeal, curve squeal, starting hiss, etc.)

### Entry format (3 bytes each)

The exact encoding of each 3-byte entry is **unknown**.
Observations:

- The **third byte** of each entry is approximately equal to its own file
  offset (low byte). This indicates a permutation or address-scrambling
  scheme rather than plain data.
- Entries for absent sounds are filled with `FF FF FF`.
- Two different DS3 files with different audio content share identical
  patterns in certain entry positions, suggesting that some bytes encode
  fixed structural information (possibly sound numbers or slot IDs) while
  others encode per-file data (possibly audio offsets/lengths).

> **TODO**: Determine whether entries encode 24-bit audio start addresses,
> lengths, or a combination. The scrambling scheme needs to be identified
> — possibly a byte-level permutation applied during SUSI programming.

### Extended track index (offset 0x100)

**120 bytes = 40 entries × 3 bytes each.**

Provides additional sound slots beyond the primary 48, for a total of up
to 88 sound slots. Used by files with many sounds (e.g. 99-Spreewald,
DL-USA-Holz); all `FF` in simpler files (e.g. SB-ALT).

These extended slots likely cover:
- Custom sounds 200–203 (DSU user sounds, IS4 only)
- Module-specific additional sounds (22–39 in some modules)

---

## Configuration region (offset 0x0CE)

**50 bytes of encoded configuration data.**

This region is identical between 99-Spreewald and DL-USA-Holz but
differs in SB-ALT, indicating it is per-file (not universal).

### Observations

- The values do **not** correspond directly to CV default values from the
  Dietz or Uhlenbrock manuals.
- In simpler files (SB-ALT), bytes at offsets 0xE0–0xF7 contain identity-
  mapped values (`E0, E1, E2, ..., F7`), while more complex files have
  scrambled values at the same positions.
- Bytes 0xF6–0xF7 are `F6 F7` in all observed files.
- The last two bytes (0xFE–0xFF) are always non-`FF` but vary between
  files.

> **TODO**: Determine the relationship between this region and the CV table
> (CVs 897–939). The data may be encoded with the same scrambling scheme
> as the track index.

---

## Audio data (offset 0x300 to EOF)

### Encoding

| Property    | Value                          |
|-------------|--------------------------------|
| Format      | PCM, unsigned                  |
| Bit depth   | 8 bits per sample              |
| Channels    | 1 (mono)                       |
| Sample rate  | **~8,000 Hz** (estimated)      |
| Byte order  | N/A (8-bit)                    |
| Silence     | 0x80 (128)                     |

### Sample rate estimation

The sample rate is not stored in the file (or is encoded in the
scrambled header). Spectral analysis of the audio data shows:

- At 8,000 Hz playback, audio energy fills ~80% of the available
  bandwidth (up to ~3.2 kHz), consistent with anti-aliased 8 kHz audio.
- At 16,000 Hz playback, audio energy only fills ~40% of bandwidth,
  suggesting this rate is too high.
- 8 kHz is the standard rate for telephone-quality audio and is typical
  for embedded sound modules of this era.
- At 8 kHz, a 320-second maximum yields 2,560,000 bytes (~2.44 MB),
  fitting a 32 Mbit (4 MB) flash chip with room for the header.

> **TODO**: Confirm sample rate by listening test or by reverse-engineering
> the SUSIkomm programmer software.

### Audio data characteristics

- The audio is **not scrambled** — byte values have a uniform distribution
  centered on 0x80, consistent with raw unsigned 8-bit PCM.
- There are no long runs of silence (0x80) between tracks; track
  boundaries must be determined from the header index, not from the audio
  stream.
- The total audio duration is `(file_size - 0x300) / sample_rate`.

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

## Related formats

| Extension | Bit depth | Modules           | Relationship to DS3     |
|-----------|-----------|-------------------|-------------------------|
| .DSD      | 8-bit     | IS3, IS4, IS6     | Oldest format           |
| .DS3      | 8-bit     | IS3, IS4, IS6     | This document           |
| .DS4      | 8-bit     | IS4, IS6 only     | Adds per-sound volume   |
| .DSU      | 8-bit     | IS4 only          | User custom sounds      |
| .DS6      | 16-bit    | IS6 only          | Extended, 640s, 40+ sounds |
| .DX4      | unknown   | X-clusive-S V4    | Target of conversion    |

All formats share the `DD 33` magic number and the same general
structure (header + audio data), but differ in header size, track
capacity, and audio bit depth.

---

## Open questions

1. **Scrambling scheme**: The header data (track index and configuration)
   appears scrambled. Is this a fixed permutation, an XOR cipher, or
   something related to the SUSI programming protocol (commands 0xA0–0xAF)?

2. **Exact sample rate**: Estimated at 8 kHz from spectral analysis. Could
   also be 11,025 Hz. Needs confirmation.

3. **Track boundary encoding**: How does each 3-byte entry in the track
   index encode the start offset and length of its corresponding sound
   in the audio data?

4. **Configuration region semantics**: What do the 50 bytes at 0xCE–0xFF
   represent? Possible candidates: CV defaults, playback parameters,
   checksum, or module identification.

5. **DS6 differences**: The DS6 header is larger (data up to ~0x500) and
   uses 16-bit audio. A separate specification is needed.
