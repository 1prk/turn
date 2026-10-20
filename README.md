# Schleppkurven-Prüfung

Browserbasierte Prüfung von Schleppkurven auf einem PDF-Lageplan. Kein Server, kein Build:
`index.html` per Doppelklick öffnen (`file://` genügt).

## Ablauf
1. **PDF laden** (Datei wählen oder per Drag & Drop) oder „Leere Fläche (Test)“.
2. **Maßstab**: zwei Punkte auf eine bekannte Strecke klicken, Länge in m eingeben. Das Bild lässt sich jederzeit
   mit der linken Maustaste ziehen (ein Klick ohne Bewegung setzt einen Punkt), Zoom per Mausrad.
3. **Fahrweise 1** (Leitlinie): Eckpunkte der Leitlinie der Vorderachsmitte klicken. 1. Klick = Start, 2. Klick = erste
   Gerade (gibt die Fahrtrichtung vor). An jedem Eckpunkt entsteht automatisch ein Kreisbogen, der tangential an die
   Geraden anschließt. Die **Live-Vorschau** zeigt das Fahrzeug immer an der Maus. Ist der Punkt an der Maus mit dem
   Lenkeinschlag nicht fahrbar, wird er auf die größtmögliche Kurve **begrenzt** (orange): So sieht man, wie weit das
   Fahrzeug kommt. Ein Klick setzt den begrenzten Punkt. Unfahrbare Fahrlinien sind nicht möglich. Punkte sind ziehbar
   (Rechtsklick löscht, Rückschritt nimmt den letzten zurück). Ein Ziehen, das die Linie unfahrbar machen würde,
   springt zurück. Wird eine bestehende Linie durch einen Fahrzeugwechsel unfahrbar, wird nur der fahrbare Teil
   gezeichnet, die übrigen Punkte sind rot markiert.
4. Ergebnis: Hüllfläche, Eckspuren, Silhouetten, Lenkrad-Anzeige. Fahrzeug per Regler oder „Abspielen“ bewegen.

## Tastenkürzel
| Taste | Funktion |
|---|---|
| `F` | Fahrlinie bearbeiten |
| `Esc` / `Enter` | Fahrlinie beenden (zuerst wird Unfertiges verworfen) |
| `M` | Maßstab setzen |
| `⌫` / `Entf` / `Strg+Z` | letzten Punkt zurück |
| `1`–`9` | Fahrzeug wählen |
| `P` | Abspielen / Pause |
| `0` / `Pos1` | Ansicht einpassen |
| `+` / `-` | Zoom |
| `Leertaste` (halten) | Plan verschieben |

## Fahrzeuge
Oben in Abschnitt 3 stehen die Fahrzeuge als Reiter. Mit **+** entsteht eine Kopie des gewählten Fahrzeugs unter neuem
Namen. Eigene Fahrzeuge lassen sich löschen. Alle Fahrzeuge und Änderungen bleiben im Browser (localStorage) erhalten.
Voreinstellungen: **PKW** und **LKW** (Radstand 5,17 m, Überhang 1,36 m / 2,69 m, Breite 2,30 m, Wendekreis außen
9,46 m, Lenkübersetzung 20 → max. Lenkwinkel ≈ 42,2°).

## Schleppkurve und Leitlinie
Die Vorderräder werden auf der Leitlinie geführt. Sie besteht aus Geraden und Kreisbögen, an denen ein Punkt des
Fahrzeugs (hier die Vorderachsmitte) entlangfährt. Die Hinterachse läuft zwangsgeführt auf einer nach innen
nachlaufenden Schleppkurve. Das ergibt die sichelförmige Verbreiterung der überstrichenen Fläche. Hüllkurven sind die
Spuren der vier Karosserieecken.

## Fahrweise 1
Der Lenkradeinschlag erfolgt während der Fahrt. Geraden und Kreisbögen schließen tangential aneinander an, an den
Übergängen entsteht kein Knick. Die Übergangsbögen sind wegen der schnellen Lenkwinkeländerung bei geringer
Geschwindigkeit vernachlässigbar klein und werden nicht modelliert. Der Fahrer lenkt mit stetig zunehmendem Einschlag
ein und mit stetig abnehmendem Einschlag aus. Dieser Einschlag ergibt sich aus dem Nachlaufen der Hinterachse.
- **Radius:** so groß, wie die Geraden es erlauben. Je weiter die Punkte auseinander liegen, desto größer die Kurve.
  Jede Gerade gibt die Hälfte ihrer freien Länge an jeden der beiden Bögen an ihren Enden.
- **Untergrenze:** Der Radius der Vorderachsmitte ist nie kleiner als beim Wendekreis (voller Einschlag,
  ≈ 4,54 m bei den PKW-Daten, max. Lenkwinkel ≈ 39,1°, Lenkrad ≈ 508° bei Übersetzung 13).
- Ist eine Strecke für den Mindestradius zu kurz oder wäre der Lenkwinkel über dem Limit, wird der Punkt nicht
  übernommen.
- Orange auf dem Weg = Lenkung am Anschlag.

## PKW (Voreinstellung)
Länge 4,88 m · Radstand 2,86 m · Überhang vorn 0,92 m / hinten 1,10 m · Breite 1,89 m (ohne Spiegel) ·
Wendekreisradius außen 5,85 m (äußerste Karosserieecke bei Vollausschlag) → max. Lenkwinkel ≈ 39,1°.

## Modell
Kinematisches Einspurmodell, die Hinterachse folgt zwangsgeführt. Nur Vorwärtsfahrt. Der Button „Kinematik prüfen“ führt Selbsttests aus
(Kreisfahrt, Wendekreis, Geradeausfahrt, Maßstab, Fahrweise 1: Tangentialität, Mindestradius, Radius wächst mit Abstand, Zielpunkt-Begrenzung, LKW); auch per `node -e "require('./js/sim.js').selfTest()"`.

## Aufbau
- `index.html` – Oberfläche
- `js/sim.js` – Kinematik ohne DOM
- `js/app.js` – Zeichnen, Werkzeuge, PDF
- `vendor/` – pdf.js 3.11.174 (Apache-2.0, klassische Non-Module-Build, läuft unter `file://`)
