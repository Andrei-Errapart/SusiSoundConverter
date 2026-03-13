#!/usr/bin/env bash
# Download documentation PDFs into this directory.
# NMRA requires a browser-like User-Agent header.

set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
UA="Mozilla/5.0"

echo "Downloading NMRA SUSI specs..."
curl -fsSL -A "$UA" -o "$DIR/NMRA_TI-9.2.3_SUSI_05_03.pdf" \
    "https://www.nmra.org/sites/default/files/ti-9.2.3_susi_05_03.pdf"
curl -fsSL -A "$UA" -o "$DIR/NMRA_S-9.4.1_SUSI_bus_communication_interface_20250627draft.pdf" \
    "https://www.nmra.org/sites/default/files/standards/sandrp/Draft/DCC/s-9.4.1_susi_bus_communication_interface_20250627draft.pdf"

echo "Downloading Dietz manuals..."
curl -fsSL -o "$DIR/Dietz_micro_IS4_V2.pdf" \
    "https://www.d-i-e-t-z.de/files/jd/plaene/micro%20IS4%20V2%20ab%202016.pdf"
curl -fsSL -o "$DIR/Dietz_IS6_Soundmodul.pdf" \
    "https://www.d-i-e-t-z.de/files/jd/plaene/IS-6Soundmodul.pdf"

curl -fsSL -o "$DIR/_tmp_programmer.zip" \
    "https://www.d-i-e-t-z.de/files/jd/plaene/SUSI-Programmer.zip"
unzip -o -q "$DIR/_tmp_programmer.zip" -d "$DIR"
mv "$DIR/SUSI-PRU Programmer USB.pdf" "$DIR/Dietz_SUSI-Programmer.pdf"
rm "$DIR/_tmp_programmer.zip"

curl -fsSL -o "$DIR/_tmp_soundmanager.zip" \
    "https://www.d-i-e-t-z.de/files/jd/plaene/SusiSoundManager-Anleitung.zip"
unzip -o -q "$DIR/_tmp_soundmanager.zip" -d "$DIR"
mv "$DIR/SusiSoundManager - Anleitung.pdf" "$DIR/Dietz_SUSIkomm_SoundManager.pdf"
rm "$DIR/_tmp_soundmanager.zip"

echo "Downloading Uhlenbrock manual..."
curl -fsSL -o "$DIR/Uhlenbrock_IntelliSound4_EN.pdf" \
    "https://www.uhlenbrock.de/de_DE/service/download/handbook/en/Bes32500e.pdf"

echo "Done. Downloaded $(ls "$DIR"/*.pdf | wc -l) PDFs."
