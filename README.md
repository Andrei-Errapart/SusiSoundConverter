[![Tested](https://github.com/Andrei-Errapart/SusiSoundConverter/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/Andrei-Errapart/SusiSoundConverter/actions/workflows/deploy-pages.yml)

# Introduction

The program SusiSoundConverter is for the conversion of DS3 sound files into DX4 files.

Synopsis: SusiSoundConverter [-i] [-o OUTPUT_FILE] INPUT_FILE

where the options are:
- `-i`: information-only; dump properties, list of tracks and their lengths, etc.
- `-o OUTPUT_FILE`: use the specified output file instead of changing the extension of the input file to `.dx4` or `.DX4`.

By default, an input file is converted to the output file.

# Development

The program is written in Zig. It is yet to be written.

# Testing

Tests live under `tests/`, each in its own subdirectory with an executable `run` script.

Run all tests:

    tests/run

Run tests matching a prefix:

    tests/run 0001

Available tests:
- `0001_sample_files_info` — downloads sample files and runs the converter in info-only mode.

# Documentation

The `doc/` directory contains reference documentation (PDFs, not checked into git).
Run `doc/download.sh` to fetch them.

Contents:
- `NMRA_TI-9.2.3_SUSI_05_03.pdf` — SUSI interface spec V1.3 (2003), by Dietz
- `NMRA_S-9.4.1_SUSI_bus_communication_interface_20250627draft.pdf` — updated NMRA SUSI draft (2025)
- `Dietz_micro_IS4_V2.pdf` — micro IntelliSound 4 module manual (plays DS3/DS4 files, 8-bit, 320s)
- `Dietz_IS6_Soundmodul.pdf` — IntelliSound 6 module manual (plays DS6 files, 16-bit, 640s)
- `Dietz_SUSI-Programmer.pdf` — SUSI Programmer USB hardware manual
- `Dietz_SUSIkomm_SoundManager.pdf` — SUSIkomm Sound Manager software manual
- `Uhlenbrock_IntelliSound4_EN.pdf` — Uhlenbrock IntelliSound 4 manual (English)

Note: the DS3/DS6/DX4 binary file formats are proprietary and undocumented.
The file format must be reverse-engineered from sample files.

# Sample input files

Sample input files (external ZIP downloads) are listed in `tests/sample-input-files.yaml`.
