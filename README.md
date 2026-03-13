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

# Sample input files

Sample input files (external ZIP downloads) are listed in `tests/sample-input-files.yaml`.
