# Schleppkurven-Prüfung

Browserbasierte Prüfung von Schleppkurven auf einem PDF-Lageplan. Kein Server, kein Build:
`index.html` per Doppelklick öffnen (`file://` genügt).

## Ablauf
1. **PDF laden** (Datei wählen oder per Drag & Drop) oder „Leere Fläche (Test)“.
2. **Maßstab**: Linienzug über eine bekannte Strecke klicken, Doppelklick/Enter, Länge in m eingeben.
3. **Fahrweg**: Bahn der Vorderachsmitte klicken (Punkte ziehbar, Rechtsklick löscht).
   Optional **Hindernisse** als Polygone zeichnen.
4. Ergebnis: Hüllfläche, Eckspuren, Silhouetten, Lenkwinkelprüfung (rot = Lenkanschlag überschritten),
   Kollisionsprüfung. Fahrzeug per Regler oder „Abspielen“ entlang des Wegs bewegen.

## Fahrzeug (Voreinstellung PKW)
Länge 4,88 m · Radstand 2,86 m · Überhang vorn 0,92 m / hinten 1,10 m · Breite 1,89 m (ohne Spiegel) ·
Wendekreisradius außen 5,85 m (äußerste Karosserieecke bei Vollausschlag) → max. Lenkwinkel ≈ 39,1°.

## Modell
Kinematisches Einspurmodell. Die Vorderachsmitte folgt dem Fahrweg (Catmull-Rom-Spline),
die Hinterachse folgt zwangsgeführt. Nur Vorwärtsfahrt. Der Button „Kinematik prüfen“ führt Selbsttests aus
(Kreisfahrt, Wendekreis, Geradeausfahrt, Maßstab, Kollision); auch per `node -e "require('./js/sim.js').selfTest()"`.

## Aufbau
- `index.html` – Oberfläche
- `js/sim.js` – Kinematik ohne DOM
- `js/app.js` – Zeichnen, Werkzeuge, PDF
- `vendor/` – pdf.js 3.11.174 (Apache-2.0, klassische Non-Module-Build, läuft unter `file://`)
