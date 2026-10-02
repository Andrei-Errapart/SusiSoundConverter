[![Tested](https://github.com/Andrei-Errapart/SusiSoundConverter/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/Andrei-Errapart/SusiSoundConverter/actions/workflows/deploy-pages.yml)

# Einführung

Dieses Repository enthält Werkzeuge und Dokumentation für die Sounddateien der
SUSI-Soundmodule von Dietz und Uhlenbrock (IntelliSound, X-clusive PROFI).
Die Dateiformate sind proprietär und vom Hersteller nicht dokumentiert; sie
wurden hier anhand von Beispieldateien per Reverse Engineering erschlossen.

Bestandteile:

- **`infosound`** — Kommandozeilenprogramm, das den Aufbau einer Sounddatei
  ausgibt (Header, Track-Tabellen, Größen, CRC32) und die Tracks auf Wunsch
  als WAV-Dateien exportiert.
- **`build_dsu`** — Kommandozeilenprogramm, das aus einer DS3-Basisdatei und
  eigenen WAV-Dateien eine DSU-Datei erzeugt (wie der SUSI-SoundManager).
- **Web-Editor** (`web/`) — Browser-Anwendung zum Ansehen, Abspielen und
  Bearbeiten von Sounddateien. Online unter
  <https://Andrei-Errapart.github.io/SusiSoundConverter/>, Beschreibung in
  [`web/README.md`](web/README.md) (englisch).
- **Formatbeschreibung** — [`doc/SOUND_FILE_FORMAT.md`](doc/SOUND_FILE_FORMAT.md)
  (englisch, Status: Entwurf / unvollständig).

# Unterstützte Formate

| Endung | Audio                    | Module                          | Beschreibung                              |
|--------|--------------------------|---------------------------------|-------------------------------------------|
| `.DSD` | 8 Bit, 13.021 Hz         | IS3, IS4, IS6                   | Ältestes Format                           |
| `.DS3` | 8 Bit, 13.021 Hz         | IS3, IS4, IS6                   | Standard-Basisdatei                       |
| `.DSU` | 8 Bit, 13.021 Hz         | IS4                             | DS3 + eigene Sounds (200–203)             |
| `.DX4` | 8 Bit, 13.021 Hz         | X-clusive-S V4                  | DS3 + mittlere Track-Tabelle (9 Paare)    |
| `.DS6` | 8 Bit, 13.021 Hz         | IS6                             | Erweitert, 640 s, über 40 Sounds          |
| `.DHE` | 16 Bit, 22.050 Hz        | X-clusive PROFI, Profi Soundbox | 128-Mbit-Flash                            |

Verschlüsselte Dateien (Magic `00 FF`) werden nicht unterstützt.

# Bauen

Die Kommandozeilenprogramme sind in Zig geschrieben und benötigen Zig 0.16.x
(mit Zig 0.17 lässt sich `build.zig` derzeit nicht übersetzen). Es gibt keine
weiteren Abhängigkeiten.

    zig build

Die Programme liegen danach in `zig-out/bin/`.

# Verwendung

## infosound

    zig-out/bin/infosound [-e] DATEI [DATEI...]

Gibt für jede Datei Magic, Format, Audiobereich, Flash-Belegung und alle
Track-Tabellen aus. Das Format wird am Dateiinhalt erkannt.

- `-e`: exportiert zusätzlich jeden Track als WAV-Datei in das aktuelle
  Verzeichnis.

Alternativ direkt über das Build-System:

    zig build info -- test_data/DL-UNI1.DS3

## build_dsu

    zig-out/bin/build_dsu PROJEKT.dsp

Liest eine SUSI-SoundManager-Projektdatei (`.dsp`, INI-Format), die eine
DS3-Basisdatei und bis zu 12 WAV-Dateien nennt (4 Sounds × Anfang, Schleife,
Ende), und schreibt `PROJEKT.DSU` in dasselbe Verzeichnis. Das Protokoll wird
auf der Standardausgabe ausgegeben.

Die WAV-Dateien müssen bereits im Zielformat vorliegen (PCM, mono, 8 Bit
vorzeichenlos, 13.021 Hz); es findet keine Umrechnung statt.

Beispielprojekt: `test_data/demoproj/demoproj.dsp`

    zig build run -- test_data/demoproj/demoproj.dsp

## Web-Editor

    cd web
    npm ci
    npx vite          # Entwicklungsserver
    npm run build     # Typprüfung (vue-tsc) + Produktions-Build
    npm run test      # Tests (Vitest)

Der Editor wird bei jedem Push auf `main` automatisch gebaut und auf GitHub
Pages veröffentlicht.

# Tests

Die Tests liegen unter `tests/`, jeder in einem eigenen Unterverzeichnis mit
einem ausführbaren `run`-Skript. Vorher müssen `zig build` und `npm ci` (in
`web/`) ausgeführt worden sein.

Alle Tests ausführen:

    tests/run

Nur Tests mit einem bestimmten Präfix ausführen:

    tests/run 0001

Vorhandene Tests:
- `0001_sample_files_info` — führt `infosound` für die Sounddateien in
  `test_data/` aus und vergleicht die Ausgabe mit den Dateien in `expected/`.
- `0002_LoadStore` — Vitest-Tests des Web-Editors: Einlesen und erneutes
  Schreiben muss für jede Beispieldatei (einschließlich `.DHE`) eine
  bytegenau identische Datei ergeben.
- `0003_build_dsu` — führt `build_dsu` für das Beispielprojekt aus und
  vergleicht DSU-Datei und Protokoll mit den erwarteten Ergebnissen.

Hinweis: Test `0001` setzt GNU sed voraus. Mit dem BSD-sed von macOS meldet er
immer „OK“, ohne die Ausgabe tatsächlich zu vergleichen.

# Testdaten

- `test_data/` — Beispieldateien der IntelliSound-Formate (`.DSD`, `.DS3`,
  `.DX4`, `.DS6`, `.DSU`), teilweise mit der zugehörigen Soundbelegung als
  `.txt`.
- `test_data/DEH/` — Beispieldateien im DHE-Format mit den zugehörigen
  Soundbelegungen (`.doc`) und CV-Listen (`.CV`).
- `test_data/demoproj/` — Beispielprojekt für `build_dsu` (Projektdatei,
  WAV-Dateien, DS3-Basisdatei).
- `tests/sample-input-files.yaml` — Liste weiterer Beispieldateien zum
  Herunterladen von der Dietz-Website (ZIP-Archive).

# Dokumentation

Das Verzeichnis `doc/` enthält die Formatbeschreibung und Referenzunterlagen:

- `SOUND_FILE_FORMAT.md` — Beschreibung der Dateiformate (englisch)
- `NMRA_TI-9.2.3_SUSI_05_03.pdf` — SUSI-Schnittstellenspezifikation V1.3 (2003), von Dietz
- `NMRA_S-9.4.1_SUSI_bus_communication_interface_20250627draft.pdf` — aktualisierter NMRA-SUSI-Entwurf (2025)
- `Dietz_micro_IS4_V2.pdf` — Anleitung micro IntelliSound 4 (spielt DS3/DS4-Dateien, 320 s)
- `Dietz_IS6_Soundmodul.pdf` — Anleitung IntelliSound 6 (spielt DS6-Dateien, 640 s)
- `Dietz_SUSI-Programmer.pdf` — Anleitung zum SUSI-Programmer (USB)
- `Dietz_SUSIkomm_SoundManager.pdf` — Anleitung zur Software SUSIkomm / SoundManager
- `Uhlenbrock_IntelliSound4_EN.pdf` — Anleitung Uhlenbrock IntelliSound 4 (englisch)
- `Anleitung X-clusive-PROFI-SOUND.pdf` — Anleitung Geräuschelektronik X-clusive-Profi (16 Bit, 22.050 Hz; deutsch/englisch)
- `Soundbox Profi.pdf` — Anleitung Geräuschelektronik Profi Soundbox (16 Bit, 22.050 Hz; deutsch/englisch)
- `IntelliSoundCreatorEng.pdf` — Anleitung zur Software Intelli Sound Creator (englisch)

Die PDFs sind im Repository enthalten. Mit `doc/download.sh` lassen sich die
NMRA-, Dietz- und Uhlenbrock-Unterlagen (die ersten sieben PDFs der Liste)
erneut herunterladen.

# Lizenz

MIT, siehe [`LICENSE`](LICENSE).
