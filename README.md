# Schleppkurven-Prüfung

Browserbasierte Prüfung von Schleppkurven auf einem PDF-Lageplan. Kein Server, kein Build:
`index.html` per Doppelklick öffnen (`file://` genügt).

## Ablauf
1. **PDF laden** (Datei wählen oder per Drag & Drop) oder „Leere Fläche (Test)“.
2. **Maßstab**: zwei Punkte auf eine bekannte Strecke klicken, Länge in m eingeben. Das Bild lässt sich jederzeit
   mit der linken Maustaste ziehen (ein Klick ohne Bewegung setzt einen Punkt), Zoom per Mausrad.
3. **Fahrweise 1**: Startpunkt der Vorderachsmitte klicken, zweiter Klick setzt die Fahrtrichtung. Danach zeigt eine
   **Live-Vorschau**, wie das Fahrzeug zur Maus fährt. Ein Klick übernimmt das Ziel (nur wenn erreichbar).
   Ziele sind ziehbar (Rechtsklick löscht, Rückschritt nimmt das letzte zurück).
4. Ergebnis: Hüllfläche, Eckspuren, Silhouetten, Lenkrad-Anzeige. Fahrzeug per Regler oder „Abspielen“ bewegen.

## Fahrweise 1
Der Lenkradeinschlag erfolgt während der Fahrt mit geringer Geschwindigkeit. Der Fahrer fährt mit stetig zunehmendem
Lenkeinschlag in den Kreisbogen ein und verlässt ihn mit stetig abnehmendem Lenkeinschlag. Im Bogen ist voll
eingeschlagen, der Außenradius entspricht dem Wendekreisradius des Fahrzeugs.
- Lenkwinkel nie über dem Maximum aus dem Wendekreis (≈ 39,1°, Lenkrad ≈ 508° bei Übersetzung 13).
- Lenkwinkeländerung nie über 20°/m Fahrstrecke (einstellbar).
- Pro Ziel: erst eine Kurve (ein-, Bogen, aus), danach geradeaus zum Ziel. Die Kurve beginnt am letzten Ziel.
  Ist die Kurve für Vollausschlag zu klein, wird nur bis zu einem kleineren Lenkwinkel eingeschlagen.
- Orange auf dem Weg = Lenkung am Anschlag.

## Fahrzeug (Voreinstellung PKW)
Länge 4,88 m · Radstand 2,86 m · Überhang vorn 0,92 m / hinten 1,10 m · Breite 1,89 m (ohne Spiegel) ·
Wendekreisradius außen 5,85 m (äußerste Karosserieecke bei Vollausschlag) → max. Lenkwinkel ≈ 39,1°.

## Modell
Kinematisches Einspurmodell, die Hinterachse folgt zwangsgeführt. Nur Vorwärtsfahrt. Der Button „Kinematik prüfen“ führt Selbsttests aus
(Kreisfahrt, Wendekreis, Geradeausfahrt, Maßstab, Fahrweise 1); auch per `node -e "require('./js/sim.js').selfTest()"`.

## Aufbau
- `index.html` – Oberfläche
- `js/sim.js` – Kinematik ohne DOM
- `js/app.js` – Zeichnen, Werkzeuge, PDF
- `vendor/` – pdf.js 3.11.174 (Apache-2.0, klassische Non-Module-Build, läuft unter `file://`)
