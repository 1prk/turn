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

**Alle Winkel in der Oberfläche sind in gon** (400 gon = Vollkreis, 100 gon = rechter Winkel): Lenkwinkel, Limit,
Lenkrad, Drehung der Bögen, Richtungsänderung.

## Wende in einem Zug
Die Recherche (siehe [docs/recherche-schleppkurven.md](docs/recherche-schleppkurven.md)) zeigt: Die RBSV 2020 gibt ihre
Schleppkurvenschablonen für **Richtungsänderungswinkel von 40 bis 200 gon** an, und AutoTURN arbeitet mit „Corner Path“
(Radius und Drehwinkel) und „Arc Path“ (Bogen zur Maus). Es gibt deshalb drei Arten von Abschnitten, umschaltbar mit
**G**, **B** und **K**:
- **Gerade / Ecke (G):** Gerade bis zum Punkt. Zwischen zwei Geraden entsteht ein tangentialer Bogen (Ecke).
  Eine Ecke von fast 200 gon geht nicht, denn die Ausrundung bräuchte unendlich lange Geraden.
- **Kurve nach Winkel (K):** Ein Bogen mit der **Richtungsänderung in gon** und einem Radius. Der Radius ist
  standardmäßig der Wendekreis (voller Einschlag, Fahrweise 1). Ein größerer Radius ist im Feld „m“ einstellbar. Ein
  kleinerer Radius als der Wendekreis geht nicht. Die Kurve beginnt am Ende der Fahrlinie. Die Maus links oder rechts
  vom Fahrzeug wählt die Drehrichtung, ein Klick setzt die Kurve (Quadrat). Danach läuft eine Gerade tangential heraus.
  **Taste W** wählt direkt eine Wende mit 200 gon in einem Zug. Eine Wende braucht mindestens 2 · R Platz in der Breite
  (PKW 9,07 m, LKW 15,38 m).
- **Bogen durch Punkt (B):** ein Kreisbogen vom Ende der Fahrlinie durch den Punkt an der Maus (Raute). Der Radius ergibt
  sich aus der Geometrie. Liegt der Punkt gegenüber, entsteht ein Halbkreis. Liegt er hinten seitlich, dreht das
  Fahrzeug mehr als 200 gon. Liegt der Punkt innerhalb des Mindestwendekreises, wird er auf den kleinsten möglichen Bogen
  begrenzt.
- **Gerade nach Bogen oder Kurve:** Sie führt tangential geradeaus heraus. Punkte daneben werden auf diese Linie gelegt.

Beim Wenden mit 200 gon und Mindestradius liegt der Außenradius der Karosserie genau auf dem Wendekreis (im Selbsttest:
PKW 5,85 m, LKW 9,45 m bei 9,46 m).

## Tastenkürzel
| Taste | Funktion |
|---|---|
| `F` | Fahrlinie bearbeiten |
| `G` / `B` / `K` | Abschnitt: Gerade/Ecke, Bogen durch Punkt oder Kurve nach Winkel |
| `W` | Wende in einem Zug (Kurve mit 200 gon) |
| `Esc` / `Enter` | Fahrlinie beenden (zuerst wird Unfertiges verworfen) |
| `M` | Maßstab setzen |
| `⌫` / `Entf` / `Strg+Z` | letzten Punkt zurück |
| `1`–`9` | Fahrzeug wählen (für die gewählte Fahrkurve) |
| `[` / `]` | Fahrkurve wechseln |
| `P` | Abspielen / Pause |
| `0` / `Pos1` | Ansicht einpassen |
| `+` / `-` | Zoom |
| `Leertaste` (halten) | Plan verschieben |

## Fahrzeuge
Oben in Abschnitt 3 stehen die Fahrzeuge als Reiter. Mit **+** entsteht eine Kopie des gewählten Fahrzeugs unter neuem
Namen. Eigene Fahrzeuge lassen sich löschen. Alle Fahrzeuge und Änderungen bleiben im Browser (localStorage) erhalten.
Voreinstellungen (Maße in m, Überhang hinten und Radstand beziehen sich bei mehreren Hinterachsen auf deren **Mitte**):

| Fahrzeug | Länge | Radstand | Überhang vorn | Überhang hinten | Breite | Wendekreis außen | max. Lenkwinkel |
|---|---|---|---|---|---|---|---|
| PKW | 4,88 | 2,86 | 0,92 | 1,10 | 1,89 | 5,85 | 43,4 gon |
| LKW | 9,22 | 5,17 | 1,36 | 2,69 | 2,30 | 9,46 | 46,9 gon |
| Müllfahrzeug 3-achsig | 9,90 | 4,77 | 1,53 | 3,60 | 2,55 | 10,25 | 38,9 gon |
| Müllfahrzeug 3-achsig Nachlaufachse (*) | 9,95 | 4,575 | 1,35 | 4,025 | 2,55 | 8,60 | 39,1 gon |
| Gelenkbus 3-achsig (18 m) | 18,00 | 5,90 | 2,70 | 9,40 (ab Mittelachse) | 2,55 | 11,40 | 48,4 gon |
| Sattelzug 16,50 m (**Platzhalter**) | 16,50 | 3,80 | 1,40 | 11,30 (ab Hinterachse der Zugmaschine bis Ende Auflieger) | 2,55 | 12,50 | 22,9 gon |

Die Fahrzeuge mit drei Achsen werden mit drei Achsen gezeichnet. Die Hinterachse im Modell ist die Mitte der beiden
hinteren Achsen. Der **Abstand der Hinterachsen** (1,35 m) ist eine Annahme. Er wirkt nur auf die Darstellung, außer bei
einer Nachlaufachse (siehe unten). Spurweite und Lenkübersetzung sind ebenfalls Annahmen (Darstellung).

### Nachlaufachse (Nachlauflenkachse)
Bei einer gelenkten Nachlaufachse lenkt die hinterste Achse gegen die Vorderachse mit. Sie hält den Momentanpol nicht
fest. Der Momentanpol liegt auf der Linie der **festen** Achse, das ist die vordere der beiden Hinterachsen. Das Modell
rechnet deshalb mit dem **wirksamen Radstand** `Radstand − Achsabstand/2` und dem wirksamen Hinterüberhang
`Überhang + Achsabstand/2` (Hilfsfunktion `Sim.modelGeom`, die gespeicherten Fahrzeugdaten bleiben unverändert). Bei
gleichem Lenkeinschlag wird die Kurve dadurch enger und das Heck schwenkt weiter aus. Lenkwinkel-Limit, Fahrsimulation,
Karosserie, Hüllkurven und Zeichnung benutzen alle dieselbe wirksame Geometrie. Die Räder der Nachlaufachse stehen
senkrecht zur Linie zum Momentanpol auf der Linie der festen Achse.

(*) **Annahme, bitte prüfen:** Die Werte der Voreinstellung (Radstand 3,90 m bis zur festen Hinterachse, 4,70 m von dort
bis zum Ende) waren schon in der alten Version die Modellwerte. Gespeichert wird jetzt, wie bei allen Fahrzeugen, auf die
Mitte der beiden Hinterachsen bezogen (3,90 + 1,35/2 = 4,575 m und 4,70 − 1,35/2 = 4,025 m). Das Verhalten dieser
Voreinstellung ist deshalb unverändert (max. Lenkwinkel 39,1 gon, Heck innerhalb des Wendekreises 8,60 m). Wäre 3,90 m
dagegen bis zur Mitte der beiden Hinterachsen gemessen, wäre der wirksame Radstand 3,225 m. Dann schwenkt die Heckecke
bei Vollausschlag bis 9,05 m aus, das ist mehr als der Wendekreis 8,60 m: Die Maße und der Wendekreis würden nicht
zusammenpassen. Der Selbsttest prüft für jede Voreinstellung, dass der äußerste Karosseriepunkt bei Vollausschlag auf dem
Wendekreis liegt.

## Gelenkfahrzeuge (Gelenkbus)
Ein Fahrzeug mit Haken „Gelenkfahrzeug“ hat zwei Karosserien. Die vordere Karosserie ist das Fahrzeug wie bisher
(Vorderachse gelenkt, Mittelachse als Hinterachse des Modells). Am **Gelenkpunkt**, 1,79 m hinter der Mittelachse,
hängt die hintere Karosserie. Ihre Hinterachse liegt 4,21 m hinter dem Gelenk und folgt dem Gelenkpunkt starr (Traktrix).
Der **Faltenbalg** wird dunkel gezeichnet und gehört zur überstrichenen Fläche. Die Hüllkurven laufen an den vorderen
Ecken der vorderen und den hinteren Ecken der hinteren Karosserie.
- Der **Knickwinkel** (Winkel zwischen den Karosserien) wird berechnet und angezeigt. Der **Grenzwert** (Voreinstellung
  65 gon) ist **kein Herstellerwert**. Bei den Maßen der Zeichnung braucht der Wendekreis von 11,40 m bei vollem Einschlag
  63,0 gon (56,7°). Ein Grenzwert von 45° wäre dafür zu klein. Bitte den echten Wert eintragen.
- Eine Fahrkurve, die den Grenzwert überschreitet, ist nicht möglich: Die Vorschau wird begrenzt, bestehende Punkte
  werden bei zu kleinem Grenzwert als ungültig markiert.
- Die Wende in einem Zug (Taste W) braucht beim Gelenkbus mindestens 2 · R = 17,13 m Platz in der Breite.
- Eigene Gelenkfahrzeuge: Fahrzeug kopieren (+), Haken „Gelenkfahrzeug“, Maße eintragen.

## Sattelzug (Sattelkupplung)
Der Sattelzug ist das maßgebende Fahrzeug an Knotenpunkten. Mathematisch ist er der Gelenkbus mit **negativem Hitch**: Der
Sattelzapfen liegt **vor** der Mitte der Hinterachsen der Zugmaschine. Es gelten dieselben Formeln, `Sim.articSteady`
behandelt das Vorzeichen: Knickwinkel `γ = atan(M / R0) + asin(L1 / √(R0² + M²))` und Radienkette
`R0 → √(R0² + M²)` (Sattelzapfen) `→ √(R0² + M² − L1²)` (Achsgruppe des Aufliegers) mit `M` = Hinterachse bis Sattelzapfen
(negativ), `L1` = Sattelzapfen bis Mitte Achsgruppe. Die Achsgruppe des Aufliegers folgt dem Sattelzapfen starr (Traktrix).
Bauart wählen im Feld „Bauart“ (Starres Fahrzeug / Gelenkbus / Sattelzug). Felder des Sattelzugs:

| Feld | Bedeutung |
|---|---|
| Hinterachse Zugmaschine bis Sattelzapfen | `hitch`, **negativ** = vor der Hinterachse (Eingabe von negativen Werten ist erlaubt) |
| Sattelzapfen bis Mitte Achsgruppe | `axle2` |
| Zugmaschine: Überhang hinter der Hinterachse | `tractorRear` |
| Auflieger: Überhang vor dem Sattelzapfen | `trailerFront` |
| Auflieger: Überhang hinter der Achsgruppe | `rearOver` |
| Auflieger: Breite | `trailerWidth` |
| Max. Knickwinkel Zugmaschine–Auflieger | `knickGon` |

Es gibt zwei Karosserien ohne Faltenbalg: das Rechteck der Zugmaschine und das Rechteck des Aufliegers (vom Sattelzapfen
+ Überhang vorn bis zum Heck, im Rahmen des Aufliegers). Die Umlaufrichtung beider Polygone ist gleich, damit die
einfache Nonzero-Füllung die Vereinigung ergibt (im Selbsttest auf einem Raster geprüft). Die Hüllkurven laufen an allen
Ecken beider Karosserien und an den inneren Seitenpunkten an beiden starren Achsen (Zugmaschine und Achsgruppe).

**Alle Maße der Voreinstellung „Sattelzug 16,50 m“ sind PLATZHALTER**, plausible Annahmen und **keine** Werte der RBSV 2020
(Gesamtlänge 16,50 m = 1,40 + 3,80 − 0,50 + 7,70 + 4,10; Wendekreisradius 12,50 m wie der Außenradius des Kraftkreises
nach § 32d StVZO; Knickwinkel-Grenze 100 gon geraten). Vor dem Einsatz mit **RBSV 2020, Anhang 1** abgleichen. Im Code
stehen sie in `Sim.SEMI_DEFAULTS` und `Sim.PRESETS`. Mit diesen Platzhaltern braucht der Wendekreis 52,0 gon Knickwinkel.

## Fahrkurven
Wie bei den Fahrzeugen gibt es in Abschnitt 4 eine Liste von **Fahrkurven** mit **+**. Jede Fahrkurve hat eigene Punkte
und ein eigenes Fahrzeug (Reiter in Abschnitt 3 wählt das Fahrzeug der gewählten Fahrkurve). Die gewählte Fahrkurve ist
blau und lässt sich bearbeiten. Die anderen sind abgeblendet in eigenen Farben sichtbar. Die Tasten `[` und `]` wechseln
die Fahrkurve. Die Fahrkurven werden nicht im Browser gespeichert, weil sie vom Plan und vom Maßstab abhängen.

## Schleppkurve und Leitlinie
Die Vorderräder werden auf der Leitlinie geführt. Sie besteht aus Geraden und Kreisbögen, an denen ein Punkt des
Fahrzeugs (hier die Vorderachsmitte) entlangfährt. Die Hinterachse läuft zwangsgeführt auf einer nach innen
nachlaufenden Schleppkurve. Das ergibt die sichelförmige Verbreiterung der überstrichenen Fläche.

**Hüllkurven:** Die äußere Hüllkurve ist die Spur der Karosserieecken. Die **innere** Hüllkurve ist es nicht: Der
innerste Punkt einer starren Karosserieseite ist der Fußpunkt des Lots vom Momentanpol auf diese Seite. Weil der
Momentanpol immer auf der Linie der starren Achse liegt (dort rollt das Rad ohne Querschlupf), liegt dieser Punkt
immer **auf Höhe der starren Achse**, nicht an einer Ecke. Die Anwendung zeichnet deshalb zusätzlich die Spuren der
beiden Seitenpunkte an der starren Achse jeder starren Karosserie (bei Gelenkfahrzeugen an beiden Karosserien).
Gezeichnet wird nur die Spur auf der Kurveninnenseite, auf der Außenseite würde sie quer durch die überstrichene
Fläche laufen. Die gefüllte Hüllfläche war schon vorher richtig (Vereinigung der Karosserieflächen), nur die Linien
waren innen falsch.

## Fahrweise 1
Der Lenkradeinschlag erfolgt während der Fahrt. Geraden und Kreisbögen schließen tangential aneinander an, an den
Übergängen entsteht kein Knick. Die Übergangsbögen sind wegen der schnellen Lenkwinkeländerung bei geringer
Geschwindigkeit vernachlässigbar klein und werden nicht modelliert. Der Fahrer lenkt mit stetig zunehmendem Einschlag
ein und mit stetig abnehmendem Einschlag aus. Dieser Einschlag ergibt sich aus dem Nachlaufen der Hinterachse.
- **Radius:** so groß, wie die Geraden es erlauben. Je weiter die Punkte auseinander liegen, desto größer die Kurve.
  Jede Gerade gibt die Hälfte ihrer freien Länge an jeden der beiden Bögen an ihren Enden.
- **Untergrenze:** Der Radius der Vorderachsmitte ist nie kleiner als beim Wendekreis (voller Einschlag,
  ≈ 4,54 m bei den PKW-Daten, max. Lenkwinkel ≈ 43,4 gon, Lenkrad ≈ 565 gon bei Übersetzung 13).
- Ist eine Strecke für den Mindestradius zu kurz oder wäre der Lenkwinkel über dem Limit, wird der Punkt nicht
  übernommen.
- Orange auf dem Weg = Lenkung am Anschlag.

## PKW (Voreinstellung)
Länge 4,88 m · Radstand 2,86 m · Überhang vorn 0,92 m / hinten 1,10 m · Breite 1,89 m (ohne Spiegel) ·
Wendekreisradius außen 5,85 m (äußerste Karosserieecke bei Vollausschlag) → max. Lenkwinkel ≈ 43,4 gon.

## Modell
Kinematisches Einspurmodell, die Hinterachse folgt zwangsgeführt. Nur Vorwärtsfahrt. Der Button „Kinematik prüfen“ führt Selbsttests aus
(Kreisfahrt, Wendekreis, innere Hüllkurve, Nachlaufachse, Sattelzug, Geradeausfahrt, Maßstab, Fahrweise 1: Tangentialität, Mindestradius, Radius wächst mit Abstand, Zielpunkt-Begrenzung, LKW); auch per `node -e "console.log(require('./js/sim.js').selfTest().filter(r => !r.ok))"` (leere Liste = alles bestanden).

## Aufbau
- `index.html` – Oberfläche
- `js/sim.js` – Kinematik ohne DOM
- `js/app.js` – Zeichnen, Werkzeuge, PDF
- `vendor/` – pdf.js 3.11.174 (Apache-2.0, klassische Non-Module-Build, läuft unter `file://`)
