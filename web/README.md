# IntelliSound Web-Editor

Browserbasierter Betrachter und Editor für Sounddateien der Formate Dietz/Uhlenbrock IntelliSound und X-clusive PROFI.

**Online:** <https://Andrei-Errapart.github.io/SusiSoundConverter/>

## Unterstützte Formate

| Formatfamilie | Endungen | Audio | Flash |
|---------------|----------|-------|-------|
| IntelliSound | `.DS3`, `.DX4`, `.DSU`, `.DS6` (sowie `.DS4`, `.DSD`) | 8 Bit vorzeichenlos, mono, 13.021 Hz | 32/64 Mbit (4/8 MB) |
| X-clusive PROFI | `.DHE` | 16 Bit vorzeichenbehaftet, mono, 22.050 Hz | 128 Mbit (16 MB) |

ZIP-Archive, die Sounddateien enthalten, werden ebenfalls unterstützt — der Editor entpackt die Sounddatei automatisch.

## Aufbau

Der Editor zeigt **zwei Bereiche nebeneinander**. In jeden Bereich kann unabhängig eine Sounddatei geladen werden, sodass sich Dateien vergleichen und Tracks zwischen ihnen kopieren lassen — auch zwischen verschiedenen Formaten (IntelliSound und DHE).

Jeder Bereich enthält:
- **Werkzeugleiste** — Schaltflächen „Datei laden“, „Aus Zwischenablage laden (URL)“ und „Exportieren“, Dateiname, Formatkennzeichen, Kennzeichen „geändert“ bei ungespeicherten Änderungen
- **Flash-Belegungsbalken** — grafische Anzeige der Speicherauslastung
- **Track-Tabellen** — ein Abschnitt je Track-Tabelle der Datei (Primär, Erweitert, Mitte usw.)

## Arbeitsabläufe

### Datei laden und ansehen

In einem der beiden Bereiche auf **Datei laden** klicken und eine Sounddatei (oder ein ZIP-Archiv, das eine enthält) auswählen. Die Track-Tabellen erscheinen mit allen Tracks. Der Flash-Belegungsbalken zeigt, wie viel vom Flash-Speicher des Moduls belegt ist.

### Track abspielen

Bei einer nicht leeren Track-Zeile auf **▶** klicken, um den Track anzuhören. Die Zeile wird während der Wiedergabe gelb hervorgehoben. Mit **■** wird die Wiedergabe gestoppt. Es spielt immer nur ein Track — der Start eines weiteren stoppt den vorherigen.

### Track zwischen Dateien kopieren

1. In einem Bereich auf eine nicht leere Track-Zeile klicken — sie wird **grün** hervorgehoben und ist damit ausgewählt.
2. Im anderen Bereich bei der Ziel-Zeile auf **←** klicken, um sie mit den Audiodaten und dem Schleifen-Offset des ausgewählten Tracks zu überschreiben.
3. Mit **Esc** lässt sich die Auswahl jederzeit aufheben.

Beim Kopieren zwischen IntelliSound- und DHE-Dateien werden die Audiodaten automatisch umgerechnet (8 Bit 13.021 Hz von/nach 16 Bit 22.050 Hz).

### URL oder Datei einfügen

Mit **Aus Zwischenablage laden (URL)** wird eine Sounddatei aus der Zwischenablage geladen. Die Schaltfläche erkennt den Inhalt der Zwischenablage und verhält sich entsprechend:

- **URL** — Enthält die Zwischenablage eine `http://`- oder `https://`-URL (z. B. `https://d-i-e-t-z.de/sounds/DL-USA.DS3`), wird die Datei direkt abgerufen und geladen. URLs von ZIP-Archiven funktionieren ebenfalls.
- **Kopierter Hyperlink** — Wird ein Download-Link von einer Webseite kopiert, liest der Editor die URL aus dem HTML und ruft sie ab.
- **Datei per Strg+V** — Wird eine Datei im Dateimanager des Betriebssystems kopiert und Strg+V gedrückt, wird sie in den zuletzt aktiven Bereich geladen.
- **Ausweichlösung** — In Browsern, die den Zugriff auf die Zwischenablage einschränken (z. B. Safari), fragt ein Dialog nach der URL zum manuellen Einfügen.

**CORS-Einschränkung:** Die meisten Websites, die Sounddateien anbieten, erlauben keine Cross-Origin-Anfragen. Bei der lokalen Entwicklung (`npm run dev`) übernimmt das der in Vite eingebaute CORS-Proxy transparent. In der GitHub-Pages-Version versucht der Editor kostenlose CORS-Proxy-Dienste (corsproxy.io, allorigins.win), die jedoch unzuverlässig sind und ausfallen können. Eine saubere Lösung wäre ein eigener CORS-Proxy, z. B. ein Cloudflare Worker (kostenloses Kontingent: 100.000 Anfragen pro Tag).

### WAV- oder MP3-Datei importieren

Bei einer beliebigen Track-Zeile auf **📁** klicken und eine `.wav`- oder `.mp3`-Datei auswählen. Die Audiodaten werden automatisch in das Format der Zieldatei umgerechnet:

- **IntelliSound-Dateien:** 8 Bit vorzeichenlos, mono, 13.021 Hz
- **DHE-Dateien:** 16 Bit vorzeichenbehaftet, mono, 22.050 Hz

WAV-Dateien müssen 8-, 16- oder 24-Bit-PCM enthalten; Stereo wird zu Mono zusammengemischt. MP3-Dateien werden mit dem eingebauten Audiodecoder des Browsers dekodiert.

### Exportieren

Mit **Exportieren** wird die geänderte Datei heruntergeladen. Vor dem Speichern prüft der Editor, ob die gesamten Daten in den Flash-Speicher des Moduls passen (4 MB, 8 MB oder 16 MB, je nach Format). Das Kennzeichen „geändert“ verschwindet nach erfolgreichem Export.

## Spalten der Track-Tabelle

| Spalte | Beschreibung |
|--------|--------------|
| **#** | Track-Index. Bei gepaarten Tabellen wird `floor(index / 2)` angezeigt. |
| **Größe** | Größe der Audiodaten in Bytes. |
| **Dauer** | Abspieldauer (berechnet aus Größe, Abtastrate und Bittiefe). |
| **Schleife** | Schleifen-Offset in Bytes (nur bei gepaarten Tabellen). |
| **CRC32** | Achtstelliger hexadezimaler Fingerabdruck der Audiodaten — hilfreich, um Duplikate zu erkennen. |
| **Aktionen** | ▶/■ abspielen/stoppen, ← mit der Auswahl überschreiben, 📁 aus Datei importieren. |

Leere Track-Plätze zeigen in den Datenspalten Striche (–). Im Kopf jeder Tabelle steht eine Belegungsangabe wie „12 / 48 belegt“.

## Flash-Belegungsbalken

Der Balken ist nach Auslastung eingefärbt:

| Auslastung | Farbe |
|------------|-------|
| 0–90 % | Blau |
| 90–98 % | Orange |
| > 98 % | Rot |

Darunter stehen die belegten Kilobytes, die Gesamtkapazität und der freie Speicher.

## Entwicklung

```bash
npm run dev       # Vite-Entwicklungsserver mit Hot Reload
npm run build     # Typprüfung (vue-tsc) + Produktions-Build
npm run test      # Vitest-Testsuite ausführen
```

Der Entwicklungsserver enthält einen lokalen CORS-Proxy unter `/cors-proxy/`, sodass das Einfügen von Download-URLs ohne externe Proxy-Dienste funktioniert. Weitergeleitete Anfragen werden im Terminal protokolliert.

Erstellt mit Vue 3, TypeScript und Vite.
