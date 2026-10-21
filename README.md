# Schleppkurven-Prüfung

Browserbasierte Prüfung von Schleppkurven auf einem PDF-Lageplan. Kein Server, kein Build:
`index.html` per Doppelklick öffnen (`file://` genügt).

## Ablauf (geführte Seitenleiste)
Die Seitenleiste führt in **sechs Schritten** durch die Arbeit. Oben zeigt ein Fortschrittsbalken, wo man steht. Nur der
aktuelle Schritt ist aufgeklappt, die fertigen Schritte stehen als eine Zeile mit Haken und Zusammenfassung da
(„Maßstab: 1 m = 20,00 pt · ca. 1:142“). Ein Klick auf einen Schritt (oder den Balken) öffnet ihn wieder. Jeder Schritt
beginnt mit einem Kasten **„Was jetzt?“**, der dem Zustand folgt. Dasselbe steht kurz als Hinweis oben im Plan. Fehlt eine
Voraussetzung, sagt der Schritt, was fehlt, und bietet einen Button dorthin an. Gesperrt ist nichts.

1. **Lageplan:** PDF laden (Datei wählen oder in das Fenster ziehen) oder „Ohne Plan testen (leere Fläche)“.
2. **Maßstab:** zwei Punkte auf eine bekannte Strecke klicken (Bemaßung, Fahrbahnbreite). Die **Länge** wird direkt an der
   Strecke im Plan eingetragen (Enter bestätigt, Esc verwirft). Dann geht es von selbst zum Fahrzeug. „Neu messen“ behält den
   alten Maßstab, bis der neue bestätigt ist.
3. **Fahrzeug:** Karten mit Draufsicht, Maßen und Platzhalter-Hinweis. Ein Klick wählt das Fahrzeug der gewählten Fahrkurve.
   Die Kennwerte stehen darunter. „Fahrzeug bearbeiten…“ klappt die Maße auf (ein eigener Editor folgt später).
4. **Fahrlinie** (Fahrweise 1): Der 1. Klick ist der Start der Vorderachsmitte, der 2. Klick die erste Gerade (sie gibt die
   Fahrtrichtung vor). Danach die Abschnittsart mit den drei großen Buttons wählen (Gerade/Ecke, Bogen durch Punkt, Kurve
   nach Winkel, dazu „Wende in einem Zug“). An jedem Eckpunkt entsteht ein tangentialer Kreisbogen. Die **Live-Vorschau**
   zeigt das Fahrzeug immer an der Maus. Ist der Punkt an der Maus mit dem Lenkeinschlag nicht fahrbar, wird er auf die
   größtmögliche Kurve **begrenzt** (orange): So sieht man, wie weit das Fahrzeug kommt. Ein Klick setzt den begrenzten
   Punkt. Punkte sind ziehbar (Rechtsklick löscht). Ein Ziehen, das die Linie unfahrbar machen würde, springt zurück. Wird
   eine bestehende Linie durch einen Fahrzeugwechsel unfahrbar, wird nur der fahrbare Teil gezeichnet, die übrigen Punkte
   sind rot markiert. Der Schalter „Fahrweise“ wählt Fahrweise 1 (Lenken während der Fahrt) oder 2 (Lenken im Stand, Knick).
   Mehrere Fahrkurven: Reiter oben im Schritt, **+** legt eine neue an. Unten im Plan stehen die
   Kennzahlen der Vorschau (Lenkwinkel, Radius, Weg, Anschlag). „Fahrlinie fertig“ führt zur Wiedergabe.
5. **Wiedergabe & Export:** Abspielen und Regler, Anzeige (Hüllfläche, Silhouetten, Bewegungsspielraum), Ergebnis, Export
   (PNG, DXF, SVG) und „weitere Fahrkurve anlegen“.
6. **Debug (optional):** Selbsttest („Kinematik prüfen“, dauert etwa 10 s), Hilfslinien (Momentanpol, Spur der Hinterachse,
   Lenkrad-Anzeige) und die Werte an der Position des Fahrzeugs.

Das Werkzeug im Plan folgt dem Schritt: In Schritt 2 misst es, in Schritt 4 zeichnet es, sonst verschiebt man nur die
Ansicht (Ziehen mit der linken Maustaste, ein Klick ohne Bewegung setzt einen Punkt; Zoom per Mausrad). Links oben im
Plan stehen Zoom, Einpassen und „Letzten Punkt zurück“ als Buttons.

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
  **Taste W** wählt direkt eine Wende mit 200 gon in einem Zug. Siehe „Leitlinie, Querversatz und Platzbedarf“ unten.
- **Bogen durch Punkt (B):** ein Kreisbogen vom Ende der Fahrlinie durch den Punkt an der Maus (Raute). Der Radius ergibt
  sich aus der Geometrie. Liegt der Punkt gegenüber, entsteht ein Halbkreis. Liegt er hinten seitlich, dreht das
  Fahrzeug mehr als 200 gon. Liegt der Punkt innerhalb des Mindestwendekreises, wird er auf den kleinsten möglichen Bogen
  begrenzt.
- **Gerade nach Bogen oder Kurve:** Sie führt tangential geradeaus heraus. Punkte daneben werden auf diese Linie gelegt.

Beim Wenden mit 200 gon und Mindestradius liegt der Außenradius der Karosserie genau auf dem Wendekreis (im Selbsttest:
PKW 5,85 m, LKW 9,45 m bei 9,46 m). Der Platzbedarf ist deshalb etwa der Wendekreisdurchmesser, nicht der Querversatz der
Leitlinie 2R.

## Tastenkürzel
Jede Funktion hat einen Button. Die Tasten sind nur Abkürzungen (sie stehen klein auf den Buttons). Die Taste `?` oder der
Link oben in der Seitenleiste zeigt die Übersicht im Plan.

| Taste | Funktion |
|---|---|
| `G` / `B` / `K` | Abschnitt: Gerade/Ecke, Bogen durch Punkt oder Kurve nach Winkel (öffnet Schritt 4) |
| `W` | Wende in einem Zug (Kurve mit 200 gon) |
| `⌫` / `Entf` / `Strg+Z` | letzten Punkt zurück (nur im Messen und im Zeichnen, nie in der Wiedergabe) |
| `Esc` | laufende Eingabe abbrechen (Punkte der Messung, Startpunkt, Hinweis, Übersicht). Wechselt nie den Schritt. |
| `1`–`9` | Fahrzeug wählen (für die gewählte Fahrkurve) |
| `P` | Abspielen / Pause (öffnet Schritt 5) |
| `0` / `Pos1` | Ansicht einpassen |
| `+` / `-` | Zoom |
| `Leertaste` (halten) | Plan verschieben |
| `?` | Übersicht der Tasten |

Entfallen sind `F` und `M` (das Werkzeug folgt dem Schritt), `[` und `]` (die Fahrkurven sind Reiter in Schritt 4) und
`Enter`/`Esc` als „Fahrlinie beenden“ (dafür gibt es „Fahrlinie fertig“).

## Fahrzeuge
In Schritt 3 stehen die Fahrzeuge als Karten (Voreinstellungen und eigene Fahrzeuge). Die Karte „Kopie des gewählten
Fahrzeugs“ legt ein eigenes Fahrzeug unter neuem Namen an. Eigene Fahrzeuge lassen sich löschen („Fahrzeug bearbeiten…“). Alle Fahrzeuge und Änderungen bleiben im Browser (localStorage) erhalten.
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
- Die Wende in einem Zug (Taste W oder Button) hat beim Gelenkbus einen Querversatz der Leitlinie von 2 · R = 17,13 m. Der Platzbedarf
  ist etwa der Wendekreisdurchmesser 22,80 m (siehe „Leitlinie, Querversatz und Platzbedarf“).
- Eigene Gelenkfahrzeuge: Fahrzeug kopieren (+), Haken „Gelenkfahrzeug“, Maße eintragen.

## Bewegungsspielraum
Die Schablonen der RBSV zeigen einen Bewegungsspielraum von 0,50 m um die überstrichene Fläche. Der Haken
**Bewegungsspielraum** in Schritt 5 zeigt ihn als helles Band um die Hüllfläche der gewählten Fahrkurve. Das Feld
daneben stellt die Breite ein (Voreinstellung **0,50 m**, **0,25 m** ist möglich). Das Band gehört zur gewählten Fahrkurve
und zur Live-Vorschau, nicht zu den abgeblendeten anderen Fahrkurven. Es ist im PNG-Export und im Vektor-Export enthalten.
Die Quellen widersprechen sich, ob die Schablonen 30 cm oder 50 cm enthalten (siehe
[docs/recherche-schleppkurven.md](docs/recherche-schleppkurven.md)). Die RBSV 2020 selbst wurde nicht gelesen.

Technik: Die überstrichene Fläche wird gefüllt und mit der Linienbreite `2 · Spielraum` (runde Ecken) gestrichen, und zwar
**deckend auf einer Offscreen-Zeichenfläche**. Erst diese Fläche wird mit Transparenz unter die Hüllfläche gezeichnet. So
scheinen die Innenkanten der Striche und die Überlappungen der Polygone nicht durch. Für das Band reicht jede 4. Silhouette
(Lücken unter 7 cm, vom Band überdeckt), denn das Streichen ist der langsame Teil.

## Vektor-Export (DXF, SVG)
Der PNG-Export ist ein Bildschirmbild und nicht maßstäblich. Die Buttons **DXF exportieren** und **SVG exportieren** in
Schritt 5 schreiben das Ergebnis der gewählten Fahrkurve als Vektoren. Das Feld daneben wählt die **Einheit**:
- **Meter** (Naturmaß). Im Text steht „Einheit: m“.
- **Plan (pt):** die Einheit des PDF-Plans (1 pt = 1/72 Zoll). Der Maßstab steht im Text („1 m = 20,00 pt, ca. 1:142 bei
  Originalgröße“). So lässt sich das Ergebnis über den Plan legen.

Ebenen (DXF-Layer und SVG-Gruppen), alle als Polylinien:

| Ebene | Inhalt |
|---|---|
| `LEITLINIE` | Weg der **Vorderachsmitte**. Das ist die Leitlinie. Im Modell ist sie identisch mit dem Weg der Vorderachse. |
| `HINTERACHSE` | Weg der Hinterachse (bei Gelenkfahrzeugen der Zugmaschine bzw. der Mittelachse) |
| `HUELLKURVE` | äußere Hüllkurven (Ecken) und innere Hüllkurven (Seitenpunkte an der starren Achse). Der Umriss der überstrichenen Fläche (Vereinigung) wird durch diese Linien angenähert. |
| `FAHRZEUG` | Umrisse des Fahrzeugs am Start und am Ende (ohne Faltenbalg) |
| `SPIELRAUM` | Kontur des Bewegungsspielraums, nur wenn der Haken gesetzt ist (**Näherung**, siehe unten) |
| `TEXT` | Fahrzeugname, Wendekreis, Lenkwinkel, Richtungsänderung, Radien der Bögen, Einheit und Maßstab |

- **DXF:** Release 12, ASCII, von Hand geschrieben (keine Bibliothek). `POLYLINE` und `TEXT`. Umlaute stehen als `\U+00FC`
  im Text. Der Ursprung liegt an der **linken unteren Ecke der Planseite**, die y-Achse zeigt nach oben (CAD-Konvention), das
  Bild ist also nicht gespiegelt. Eine Prüfung mit der Bibliothek ezdxf (nicht Teil des Projekts) liest die Dateien ohne Fehler.
- **SVG:** Plankoordinaten, die y-Achse zeigt nach unten wie im Plan. Die `viewBox` zeigt das Ergebnis, der Text steht darunter.
- Die Linien sind auf 2 mm Abweichung vereinfacht (Douglas-Peucker), damit die Dateien klein bleiben.
- **Kontur des Bewegungsspielraums:** Sie besteht aus den Versatzkurven der Hüllkurven im Abstand des Spielraums. Ein Punkt
  gehört zur Kontur, wenn er nicht in der überstrichenen Fläche und nicht näher als der Spielraum an einer Hüllkurve liegt.
  Die Enden werden mit Bögen um die Ecken des Fahrzeugs am Start und am Ende geschlossen. An Übergängen zwischen zwei
  Hüllkurven sind kleine Lücken möglich. Im Selbsttest liegen alle Punkte auf 1 cm genau im Abstand des Spielraums.
- Der Download läuft über eine Blob-URL wie beim PNG.

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
In Schritt 4 gibt es eine Liste von **Fahrkurven** (Reiter) mit **+**. Jede Fahrkurve hat eigene Punkte und ein eigenes
Fahrzeug (Schritt 3 wählt das Fahrzeug der gewählten Fahrkurve und nennt sie dabei). Die gewählte Fahrkurve ist blau und
lässt sich bearbeiten. Die anderen sind abgeblendet in eigenen Farben sichtbar. Die Fahrkurven werden nicht im Browser gespeichert, weil sie vom Plan und vom Maßstab abhängen.

### Versionen der Voreinstellungen
Gespeicherte Voreinstellungen überschrieben früher korrigierte Werte für immer. Jetzt hat der Programmstand eine
**Version der Voreinstellungen** (`Sim.PRESET_VERSION`, aktuell 2). Der Browser speichert sie mit den Fahrzeugen, und jedes
gespeicherte Voreinstellungs-Fahrzeug trägt eine Kopie der Werte, aus denen es entstanden ist (`base`). Beim Laden gilt für
jedes Feld einer Voreinstellung:
- Ist der gespeicherte Wert gleich dem Wert in `base`, hat der Nutzer ihn nicht geändert: Das Fahrzeug bekommt den **neuen
  Wert der Voreinstellung**.
- Ist er verschieden, hat der Nutzer ihn geändert: Er **bleibt**. Das gilt auch für den Namen (eine umbenannte
  Voreinstellung wird über `base` erkannt und nicht doppelt angelegt).
- Eigene Fahrzeuge (Kopien mit **+**) bleiben unverändert. Das gilt auch für eine Kopie des Fahrzeugs mit Nachlaufachse: Ihre
  Zahlen werden jetzt mit dem neuen Modell gerechnet (Radstand bis zur Mitte der Hinterachsen).
- Neue Voreinstellungen werden hinten angefügt.

Wurden Voreinstellungen aktualisiert oder ergänzt, zeigt ein Hinweis oben in der Seitenleiste, welche und von welcher
Version auf welche (ein Klick blendet ihn aus). Daten aus der Zeit vor der Versionierung gelten als Version 1; für sie liegen
die damaligen Werte in `Sim.PRESET_HISTORY`, damit auch dort Änderungen erkannt werden. Der Button „Voreinstellung
wiederherstellen“ setzt alle Felder zurück. Beim Ändern einer Voreinstellung im Code: `PRESET_VERSION` erhöhen.

## Leitlinie, Querversatz und Platzbedarf
**Die Leitlinie ist der Weg der Mitte der Vorderachse**, nicht der Weg der Karosserie. Alle Punkte, Geraden und Bögen der
Fahrlinie beziehen sich darauf (Start = Vorderachsmitte, „Radius“ einer Kurve = Radius der Vorderachsmitte). Die Karosserie
liegt je nach Kurve innen und außen davon (siehe Hüllkurven).

Bei einer **Wende in einem Zug** (200 gon, Taste W) mit Mindestradius R der Vorderachsmitte endet die Leitlinie um
**2 · R seitlich versetzt** vom Start. Dieser **Querversatz 2R ist nur der Versatz der Leitlinie, nicht der Platzbedarf.**
Der Platzbedarf einer Wende ist etwa der **Wendekreisdurchmesser 2 · R<sub>außen</sub>**, weil die äußerste Karosserieecke
auf dem Wendekreis läuft (Selbsttest: Außenradius = Wendekreis). Zum Vergleich:

| Fahrzeug | Querversatz der Leitlinie 2R | Platzbedarf etwa Wendekreis-⌀ 2 · R<sub>außen</sub> |
|---|---|---|
| PKW | 9,07 m | 11,70 m |
| LKW | 15,38 m | 18,92 m |
| Müllfahrzeug 3-achsig | 16,63 m | 20,50 m |
| Müllfahrzeug 3-achsig Nachlaufachse | 13,54 m | 17,20 m |
| Gelenkbus 3-achsig (18 m) | 17,13 m | 22,80 m |
| Sattelzug 16,50 m (Platzhalter) | 21,57 m | 25,00 m |

Die Anwendung zeigt beides: Die Fahrzeuginfo und das Ergebnis nennen den Wendekreis-⌀, und bei einem Bogen ab 150 gon steht
der Querversatz der Leitlinie ausdrücklich als „nur die Leitlinie“ dabei.

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
- Orange auf dem Weg = Lenkung am Anschlag (nur in Fahrweise 1. In Fahrweise 2 ist der Anschlag der Normalfall).

## Fahrweise 2
Die Fahrzeugführer lenken bei annähernd stehendem Fahrzeug und fahren dann an. Dabei ergibt sich in der Leitlinie ein
**Knick**. Diese Fahrweise mit der Lenkwinkeländerung bis zum Maximum im Stand wird durch die Annahme eines **abrupten
Übergangs** zwischen Gerade und Kreisbogen simuliert. Daraus ergibt sich ein fahrzeugtechnisch möglicher
Richtungsänderungswinkel von ca. 40 gon, bei Bussen (ausgenommen Gelenkbussen) 55 gon. (Beschreibung der RBSV, wie vom
Auftraggeber genannt. Die RBSV 2020 selbst wurde nicht gelesen.)

**Bedienung:** In Schritt 4 wählt der Schalter „Fahrweise dieser Fahrkurve“ die Fahrweise der gewählten Fahrkurve. Jede
Fahrkurve hat ihre eigene Fahrweise (Reiter zeigen „FW 2“). „Mit Fahrweise 2 duplizieren“ legt eine Kopie mit der anderen
Fahrweise an, so lassen sich beide Fahrweisen im selben Plan vergleichen. Die Abschnittsarten (Gerade/Ecke, Bogen durch
Punkt, Kurve nach Winkel, Wende) gibt es in beiden Fahrweisen.

### Modell
- Der **Knick der Leitlinie** (Weg der Vorderachsmitte) ist der Lenkwinkel, den das Fahrzeug im Stand macht: Am Anfang des
  Bogens springt die Fahrtrichtung der Vorderachse um den Anschlag `δmax = atan(Radstand / Radius der Hinterachse)`. Die
  Anwendung berechnet ihn aus dem Wendekreis (PKW 43,4 gon, siehe Tabelle).
- Ein kinematisches Fahrzeug mit festem Lenkwinkel dreht sich sofort um einen **festen Momentanpol**. Es gibt keinen
  Übergang und kein Nachlaufen. Am Ende des Bogens geht der Lenkwinkel ebenso sofort auf null zurück (zweiter Knick), und
  das Fahrzeug fährt in seiner Richtung geradeaus.
- **Ecke zwischen zwei Geraden** (die Geraden sind Wege der Vorderachsmitte, Richtungsänderung Δ): Die **Hinterachse** fährt
  einen Kreis mit dem Radius `R_hinten` (voller Einschlag), der beide Geraden berührt. Die Tangentenlänge ist
  `tr = R_hinten · tan(Δ/2)`. Die Vorderachse fährt geradeaus, bis sie einen Radstand vor dem Berührpunkt der Hinterachse
  liegt. Dann folgen der Knick, der Bogen um den Momentanpol (Radius `R_vorn = √(R_hinten² + Radstand²)`, Drehwinkel Δ), der
  zweite Knick und die nächste Gerade. Bei großem Δ schwingt die Vorderachse über den Eckpunkt hinaus. Die Karosserie
  dreht sich als starres Ganzes: Die äußerste Ecke läuft genau auf dem Wendekreis (Selbsttest).
- **Mindestlängen:** Zwischen zwei Ecken `tr₁ + tr₂`, die erste Gerade (und eine Gerade nach einem Bogen) `tr − Radstand`,
  die letzte Gerade `tr + Radstand`. Sonst meldet die Anwendung „Strecke zu kurz“ (Fahrweise 1 braucht die Tangentenlängen
  des Bogens der Vorderachse und keinen Radstand).
- **Bogen durch Punkt:** Mit dem Abstand `c` zum Punkt und dem Winkel `α` zur Fahrzeugrichtung fährt die Hinterachse den
  Radius `ρ = (c + 2 · Radstand · cos α) / (2 · sin α)`. Der Knick ist `atan(Radstand / ρ)`. `ρ` darf nicht unter `R_hinten`
  liegen (sonst „Bogen zu eng“).
- **Kurve nach Winkel** (Radius R, Richtungsänderung des Fahrzeugs): Der Knick ist `asin(Radstand / R)`. Mit dem
  Mindestradius ist das der Anschlag. Die Gerade danach läuft in der Fahrzeugrichtung weiter.
- **Wende in einem Zug** (200 gon, Mindestradius): Das Fahrzeug dreht sich um 200 gon um den festen Punkt. Die Vorderachse
  endet `2 · R_hinten` seitlich und `2 · Radstand` hinter dem Start (PKW: 7,04 m und 5,72 m; Fahrweise 1: 9,07 m Querversatz).
  Der Platzbedarf bleibt etwa der Wendekreisdurchmesser.

### Knickwinkel der Voreinstellungen
| Fahrzeug | Knick = Lenkwinkel max. | RBSV |
|---|---|---|
| PKW | 43,4 gon | ca. 40 gon |
| LKW | 46,9 gon | ca. 40 gon |
| Müllfahrzeug 3-achsig | 38,9 gon | ca. 40 gon |
| Müllfahrzeug 3-achsig Nachlaufachse | 39,1 gon | ca. 40 gon |
| Gelenkbus 3-achsig (18 m) | 48,4 gon | Gelenkbusse sind von den 55 gon ausgenommen |
| Sattelzug 16,50 m (Platzhalter) | 22,9 gon | ca. 40 gon (Platzhalter-Maße, siehe Sattelzug) |

### Annahmen und offene Punkte
- Der Knick wird **aus dem Wendekreis berechnet** und nicht fest auf 40 oder 55 gon gesetzt, denn er ist das Ergebnis des
  vollen Einschlags. Die Werte der Tabelle stimmen mit den „ca. 40 gon“ ungefähr überein, nur der Sattelzug mit seinen
  Platzhaltermaßen (Wendekreis 12,50 m) nicht. Für einen Solobus (55 gon) gibt es keine Voreinstellung: Fahrzeug kopieren
  und Maße eintragen, der Knick steht in der Fahrzeuginfo und im Ergebnis.
- Fahrweise 2 lenkt an **jeder** Ecke bis zum Anschlag, auch bei kleinen Richtungsänderungen. Unter etwa 40 gon ist
  Fahrweise 1 realistischer. Die Anwendung schaltet nicht selbst um.
- Gelenkfahrzeuge: Die vordere Karosserie dreht sich wie beschrieben. Die hintere folgt dem Gelenk wie bisher (Traktrix),
  sie braucht nach dem Einschlag etwas Weg. Der Knickwinkel-Grenzwert wird wie in Fahrweise 1 geprüft.
- Selbsttest: Drehung um den festen Punkt (Abweichung 0,0 mm), Knick = Lenkwinkel, Wende (Endlage in geschlossener Form),
  Bogen durch Punkt, Mindestlängen, 500 zufällige Zielpunkte und Kurven.

## PKW (Voreinstellung)
Länge 4,88 m · Radstand 2,86 m · Überhang vorn 0,92 m / hinten 1,10 m · Breite 1,89 m (ohne Spiegel) ·
Wendekreisradius außen 5,85 m (äußerste Karosserieecke bei Vollausschlag) → max. Lenkwinkel ≈ 43,4 gon.

## Modell
Kinematisches Einspurmodell, die Hinterachse folgt zwangsgeführt. Nur Vorwärtsfahrt. Die Leitlinie ist die Vorderachsmitte. Der Button „Kinematik prüfen“ führt Selbsttests aus
(Kreisfahrt, Wendekreis, innere Hüllkurve, Nachlaufachse, Sattelzug, Fahrweise 2, Vektor-Export, Versionen der Voreinstellungen, Geradeausfahrt, Maßstab, Fahrweise 1: Tangentialität, Mindestradius, Radius wächst mit Abstand, Zielpunkt-Begrenzung, LKW); auch per `node -e "console.log(require('./js/sim.js').selfTest().filter(r => !r.ok))"` (leere Liste = alles bestanden).

## Aufbau
- `index.html` – Oberfläche
- `js/sim.js` – Kinematik ohne DOM
- `js/export.js` – Vektor-Export (DXF, SVG) und Kontur des Bewegungsspielraums, ohne DOM, mit eigenen Tests (laufen im Selbsttest von `sim.js` mit)
- `js/app.js` – Zeichnen, Werkzeuge, PDF
- `vendor/` – pdf.js 3.11.174 (Apache-2.0, klassische Non-Module-Build, läuft unter `file://`)
