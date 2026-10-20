# Schleppkurven-Prüfung

Browserbasierte Prüfung von Schleppkurven auf einem PDF-Lageplan. Kein Server, kein Build:
`index.html` per Doppelklick öffnen (`file://` genügt).

## Ablauf
1. **PDF laden** (Datei wählen oder per Drag & Drop) oder „Leere Fläche (Test)“.
2. **Maßstab**: Linienzug über eine bekannte Strecke klicken, Doppelklick/Enter, Länge in m eingeben.
3. **Fahren**: Startpunkt der Vorderachsmitte klicken, zweiter Klick setzt die Fahrtrichtung. Danach zeigt eine
   **Live-Vorschau**, wie das Fahrzeug zur Maus fährt. Ein Klick übernimmt das Ziel. Nicht erreichbare Ziele
   lassen sich nicht setzen. Ziele sind ziehbar (Rechtsklick löscht, Rückschritt nimmt das letzte zurück).
   Optional **Hindernisse** als Polygone zeichnen.
4. Ergebnis: Hüllfläche, Eckspuren, Silhouetten, Lenkrad-Anzeige, Kollisionsprüfung. Fahrzeug per Regler
   oder „Abspielen“ entlang des Wegs bewegen.

## Lenkung (keine unrealistischen Kurven)
Der Fahrer zeigt mit den Vorderrädern auf das Ziel. Zwei harte Grenzen gelten immer:
- Lenkwinkel nie über dem Maximum aus dem Wendekreis (≈ 39,1°, Lenkrad ≈ 508° bei Übersetzung 13).
- Lenkwinkeländerung nie über 20°/m Fahrstrecke (einstellbar). Der Lenkwinkel bleibt über Ziele hinweg stetig.
Orange auf dem Weg = Lenkung am Anschlag.

## Fahrzeug (Voreinstellung PKW)
Länge 4,88 m · Radstand 2,86 m · Überhang vorn 0,92 m / hinten 1,10 m · Breite 1,89 m (ohne Spiegel) ·
Wendekreisradius außen 5,85 m (äußerste Karosserieecke bei Vollausschlag) → max. Lenkwinkel ≈ 39,1°.

## Modell
Kinematisches Einspurmodell mit Lenkwinkel- und Lenkgeschwindigkeitsgrenze, die Hinterachse folgt zwangsgeführt. Nur Vorwärtsfahrt. Der Button „Kinematik prüfen“ führt Selbsttests aus
(Kreisfahrt, Wendekreis, Geradeausfahrt, Maßstab, Kollision); auch per `node -e "require('./js/sim.js').selfTest()"`.

## Aufbau
- `index.html` – Oberfläche
- `js/sim.js` – Kinematik ohne DOM
- `js/app.js` – Zeichnen, Werkzeuge, PDF
- `vendor/` – pdf.js 3.11.174 (Apache-2.0, klassische Non-Module-Build, läuft unter `file://`)
