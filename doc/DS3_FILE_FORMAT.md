# DS3 File Format Specification

Status: **draft / partial**

This document describes the binary format of `.DS3` sound files used by
Dietz / Uhlenbrock IntelliSound modules (micro-IS3, micro-IS4, and compatible).
DS3 files contain 8-bit mono audio at 13,021 Hz and metadata for model railway
sound decoders connected via the SUSI (Serial User Standard Interface) bus.

The format is proprietary and undocumented. This specification was derived by
hex analysis of sample files, cross-referencing the Uhlenbrock IntelliSound 4
and Dietz micro-IS4 V2 manuals.

## Reference files

| File             | Size (bytes) | Audio (bytes) | Duration   |
|------------------|-------------|---------------|------------|
| 99-Spreewald.DS3 | 601,894     | 601,126       | ~46.2 s    |
| DL-USA-Holz.DS3  | 563,228     | 562,460       | ~43.2 s    |
| SB-ALT.DS3       | 435,300     | 434,532       | ~33.4 s    |
| DL-UNI1.DS3      | 651,982     | 651,214       | ~50.0 s    |

Duration = audio bytes / 13,021 Hz.

---

## Overall layout

| Offset    | Length   | Description                                    |
|-----------|----------|------------------------------------------------|
| 0x000     | 2        | Magic number: `DD 33`                          |
| 0x002     | 2        | Format tag: `FF FF` for DS3                    |
| 0x004     | 144      | Track index table (48 × 3-byte entries)        |
| 0x094     | 22       | Padding (`FF`)                                 |
| 0x0AA     | 36       | Reserved; used for DSU user sound pointers (see DSU_FILE_FORMAT.md) |
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

Each entry is a **24-bit little-endian absolute file offset** pointing
to the start of the sound's audio data. The entry is XOR-scrambled:
each byte at file offset N is stored as `value XOR (N & 0xFF)`.

To decode an entry at file offset `base`:

```
decoded[0] = raw[base+0] XOR ((base+0) & 0xFF)
decoded[1] = raw[base+1] XOR ((base+1) & 0xFF)
decoded[2] = raw[base+2] XOR ((base+2) & 0xFF)
address    = decoded[0] + decoded[1]*256 + decoded[2]*65536
```

For example, in `DL-UNI1.DS3`, entry 0 at offset 0x004 contains raw
bytes `04 06 06`. Decoding: `04^04=00`, `06^05=03`, `06^06=00` →
address 0x000300 = 768, which is exactly the start of the audio region.

- Entries for absent sounds are filled with raw `FF FF FF` (not XOR'd).
- The length of each sound is determined by the difference between
  consecutive decoded addresses.
- Consecutive entries with the same decoded address indicate an empty
  sound slot (zero-length audio).

### Extended track index (offset 0x100)

**120 bytes = 40 entries × 3 bytes each.**

Uses the same XOR encoding as the primary table. The entries come in
**pairs**: each pair of entries decodes to the same address. The 40
entries represent 20 sounds. The purpose of the pairing is not fully
understood — it may encode separate start and loop-back addresses
(which happen to be identical in the observed files).

Used by files with many sounds (e.g. 99-Spreewald, DL-USA-Holz);
all `FF` in simpler files (e.g. SB-ALT).

---

## Configuration region (offset 0x0CE)

**50 bytes of configuration data, using the same XOR encoding as the
track index** (each byte at offset N stored as `value XOR (N & 0xFF)`).

This region is identical between 99-Spreewald and DL-USA-Holz but
differs in SB-ALT, indicating it is per-file (not universal).

### Decoded values (DL-UNI1.DS3)

```
0x0CE: 87 3C 01 FF FF 04 FF FF 2D 00 00 FF FF FF FF FF
0x0DE: FF 04 29 2F 6B 73 D8 E0 18 20 50 56 96 9D 03 09
0x0EE: 3E 45 AC B4 A5 A7 D4 D6 00 00 13 15 00 00 00 00
0x0FE: 03 21
```

The decoded values often come in pairs (e.g. 29/2F, 6B/73, D8/E0),
suggesting they may encode start/end parameters for sound playback
(speed ramp boundaries, volume curves, etc.). Several `FF` values
indicate unused or default parameters.

> **TODO**: Determine the relationship between this region and the CV table
> (CVs 897–939). The decoded values do not directly match published CV
> defaults.

---

## Audio data (offset 0x300 to EOF)

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
- The SUSI-SoundManager (SUSIsound.EXE) expects input WAV files at
  13,021 Hz.

The sample rate is not stored in the DS3 file itself; it is a fixed
property of the IntelliSound playback hardware.

At 13,021 Hz with a 32 Mbit (4 MB) flash chip, maximum recording
duration is approximately 4,193,536 / 13,021 = **322 seconds**.

### Audio data characteristics

- The audio is raw unsigned 8-bit PCM — can be seen directly in the output of SUSI-SoundManager.
- Byte values `0x00` and `0xFF` are avoided in user sound regions (DSU)
  by clamping to `0x01` and `0xFE` respectively, since these values serve
  as markers in the format (see DSU_FILE_FORMAT.md). The base DS3 audio
  data does not appear to have this restriction.
- There are no long runs of silence (0x80) between tracks; track
  boundaries must be determined from the header index, not from the audio
  stream.
- The total audio duration is `(file_size - 0x300) / 13021`.

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
| .DSU      | 8-bit     | IS4 only          | User custom sounds (see DSU_FILE_FORMAT.md) |
| .DS6      | 16-bit    | IS6 only          | Extended, 640s, 40+ sounds |
| .DX4      | unknown   | X-clusive-S V4    | Target of conversion    |

All formats share the `DD 33` magic number and the same general
structure (header + audio data), but differ in header size, track
capacity, and audio bit depth.

---

## Open questions

1. **Sound number to entry mapping**: Which sound numbers (0–39, 92–99)
   correspond to which entry indices in the primary table (0–47)? Is the
   mapping simply `entry_index = sound_number` for 0–39, with 92–99
   mapped to entries 40–47? Comparing multiple DS3 files with known
   sound assignments would resolve this.

2. **Extended table pair semantics**: Each pair of entries in the extended
   table decodes to the same address. Are these start/loop-back pairs,
   or do they serve another purpose?

3. **Configuration region semantics**: The 50 decoded bytes at 0xCE–0xFF
   likely encode playback parameters (speed ramp, volume curves) or CV
   defaults. The exact byte-to-parameter mapping is unknown.

4. **DS6 differences**: The DS6 header is larger (data up to ~0x500) and
   uses 16-bit audio. A separate specification is needed.
