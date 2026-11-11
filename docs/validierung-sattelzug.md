# Validierung: Sattelzug gegen die Schablone „Schleppkurve 4, Sattelzug“ (A3, 1:250)

Die Schablone hat neun Kurven mit 40 bis 200 gon in Schritten von 20 gon (RBSV-Bereich). Magenta ist die Leitlinie der
Vorderachsmitte, blau die Hüllkurve der Karosserie, rot die Hüllkurve mit 0,5 m Sicherheitsabstand (gemessen 0,55 m).
Die Maße stammen aus der Tabelle des Auftraggebers.

| | Zugmaschine (2 Achsen) | Auflieger (3 Achsen) |
|---|---|---|
| Länge | 6,20 m | 13,59 m |
| Vorderkante bis Vorderachse / Sattelzapfen | 1,43 m | 1,74 m |
| Radstand / Zapfen bis Achsgruppe | 3,95 m | 7,60 m |
| Überhang hinten | 0,82 m | 4,25 m |
| Breite | 2,55 m | 2,55 m |
| Wendekreis außen (Radius) | 7,9 m | |

Gesamtlänge 16,50 m. Daraus folgt: Der Sattelzapfen liegt **0,73 m vor der Hinterachse** der Zugmaschine. Die Seitenansicht
der Schablone bestätigt die Maße auf 1 cm.

## 1. Ergebnis der Prüfung vor den Änderungen

Der Kinematikkern des Programms (`Sim.run`, `Sim.pursue`, `Sim.addRearBody`) ist richtig: Mit der **Leitlinie aus der Schablone**
trifft die berechnete Hüllfläche die blaue Hüllkurve auf 0,01 m (Außenbogen und Ausschwenken des Aufliegers).
Es gab fünf Abweichungen im Programm:

| # | Befund | Änderung |
|---|---|---|
| F1 | Kein Sattelzug als Fahrzeug. | Voreinstellung „Sattelzug 16,50 m“ (negativer `hitch`). |
| F2 | `Sim.bodyPolys`: Der Auflieger begann am Sattelzapfen. Seine Vorderkante (1,74 m davor) fehlte. Die Hüllfläche war bis 0,60 m zu klein (2,3 m² bei 40 gon, 8,6 m² bei 200 gon). | Feld `hitchFront`. |
| F3 | Die Zugmaschine endete am Sattelzapfen statt 0,82 m hinter der Hinterachse. Der Faltenbalg war für einen Sattelzug sinnlos. | Felder `semi`, `towRear`. Zwei Körper, kein Faltenbalg. |
| F4 | Grenzwert des Knickwinkels: 65 gon (Wert des Busses) zwang die Wende auf R = 8,03 m. `Sim.articSteady` gibt für den Sattelzug `null` (kein stationärer Kreis, weil der Zapfenkreis von 4,57 m kleiner ist als der Auflieger mit 7,6 m). | `knickGon` = 100 gon. Neue Funktion `Sim.articTurn` (Knickwinkel einer Wende). `Sim.makeTurn` prüft bei Gelenkfahrzeugen auch eine gerade Ausfahrt. |
| F5 | Die Wende war ein Kreisbogen ohne Lenkübergänge. Die Schablone hat sie. Der Versatz der Austrittslinie war bei 200 gon 11,99 m statt 13,1 m. | Lenkrampen (`rampIn`, `rampOut`, `rampPow`), siehe unten. |

## 2. Lenkrampen (F5)

Fahrweise 1 sagt: Der Fahrer lenkt **während der Fahrt** stetig ein und stetig aus. Das Programm hatte das bisher nicht umgesetzt.
Jetzt gilt für „Kurve nach Winkel“, wenn ein Fahrzeug Rampen hat:

- Der Lenkwinkel ändert sich mit konstanter Rate über der Wegstrecke: in `rampIn` Metern von 0 bis zum vollen Einschlag, in
  `rampOut · (Winkel / 200 gon)^rampPow` Metern zurück auf 0.
- Die Bahn der Vorderachse ergibt sich aus dem Einspurmodell (Richtungsänderung je Meter = sin(Lenkwinkel) / Radstand).
  Das Fahrzeug dreht sich also auch noch, während die Lenkung zurückgeht.
- Dazwischen bleibt der Lenkwinkel konstant (Radius R). Die Länge dieses Teils wird so gesucht, dass die Richtungsänderung genau
  stimmt. Bei kurzen Kurven wird der Spitzenwinkel kleiner.
- Ohne Rampen (`rampIn = rampOut = 0`, alle anderen Fahrzeuge) ist das Verhalten unverändert (Kreisbogen).
- Die Rampen gelten nur für „Kurve nach Winkel“ (K, W), nicht für Ecken (G) und Bogen durch Punkt (B).
- Die Rampen setzen voraus, dass das Fahrzeug am Anfang der Kurve gerade steht (wie nach einer Geraden).

Werte für den Sattelzug (angepasst an die Schablone): `rampIn` = 0,5 m, `rampOut` = 24 m (bei 200 gon), `rampPow` = 2.
Die Lenkung beginnt 3,75 m vor der Vorderkante des Fahrzeugs im Startbild (5,18 m nach der Vorderachse).
Grund für die Form: Die digitalisierte Leitlinie der 200-gon-Kurve geht geradeaus bis X ≈ −2,2 bis −3,3 m, lenkt schnell ein,
hält R ≈ 6,0 m (das ist der Radius der Vorderachse bei Wendekreis 7,9 m) und öffnet dann über etwa 15 m langsam.
Einfache Modelle (Kreisbogen, symmetrische Rampen, Rampen mit linear steigender Krümmung) passten nicht.

## 3. Prüfung nach den Änderungen

Alle Werte: Programm gegen Schablone. Die Schablone ist ein Bild (Maßstab 16,3 px/m, Unsicherheit etwa 1 %).

### 3.1 Hüllkurve, alle neun Winkel (Programm mit Rampen gegen Programm nur mit Kreisbogen)
Mittlerer Abstand der berechneten Hüllkurve zur nächsten blauen Linie, ohne Startbild und Endbild. Rampen: Lenkbeginn 3,75 m vor der
Vorderkante. Kreisbogen: Beginn 1,0 m hinter der Vorderkante (beste gemeinsame Anpassung für alle neun Winkel):

| gon | mit Rampen [m] | nur Kreisbogen [m] | Austrittslinie: Schablone [m] | mit Rampen (Diff.) | nur Kreisbogen (Diff.) |
|---|---|---|---|---|---|
| 40 | 0,33 | 0,58 | 1,12 | 0,90 (−0,22) | 0,56 (−0,56) |
| 60 | 0,35 | 0,57 | 2,40 | 1,95 (−0,45) | 1,66 (−0,74) |
| 80 | 0,37 | 0,49 | 3,78 | 3,29 (−0,49) | 3,19 (−0,59) |
| 100 | 0,54 | 0,64 | 5,12 | 4,86 (−0,26) | 5,00 (−0,12) |
| 120 | 0,42 | 0,57 | 6,22 | 6,55 (+0,33) | 6,90 (+0,68) |
| 140 | 0,43 | 0,57 | 7,76 | 8,28 (+0,52) | 8,71 (+0,95) |
| 160 | 0,55 | 0,62 | 8,74 | 9,96 (+1,22) | 10,26 (+1,52) |
| 180 | 0,51 | 0,53 | 10,68 | 11,54 (+0,86) | 11,39 (+0,71) |
| 200 | 0,28 | 0,66 | 13,12 | 12,95 (−0,17) | 11,99 (−1,13) |
| Mittel / RMS | **0,42** | 0,58 | | **RMS 0,60** | RMS 0,86 |

Der Austrittsversatz ist der Abstand der Austrittslinie der Leitlinie von der Startlinie, gemessen in der Schablone (Messunsicherheit
etwa 0,4 m). Die Winkel 40 bis 100 gon und 200 gon liegen innerhalb von 0,5 m. Bei 160 gon und 180 gon bleibt eine Abweichung von
etwa 1 m. Mit Rampen ist das Ergebnis bei jedem Winkel mindestens so gut wie ohne.
Die Messwerte der Austrittslinien stehen im Selbsttest (Toleranz 0,4 bis 1,4 m).

### 3.2 Die 200-gon-Kurve im Detail
- Außenbogen und Ausschwenken des Aufliegers (mit der Leitlinie der Schablone): 0,01 m mittlerer Abstand.
- Mit der Leitlinie des Programms: mittlerer Abstand 0,28 m, 52 % der Hüllkurve innerhalb von 0,25 m. Der Kreisbogen kam auf 0,66 m und 21 %
  (Start der Kurve so gewählt, dass alle neun Winkel zusammen am besten passen). Mit dem für 200 gon allein besten Start waren es 0,52 m und 34 %.
- Max. Lenkwinkel 45,8 gon (Grenze 45,8 gon), max. Knickwinkel 69,7 gon (Grenze 100 gon; vorher nötig 82,4 gon).

### 3.3 Selbsttest im Programm
`Sim.selfTest()` (Schaltfläche „Kinematik prüfen“) hat jetzt 64 Prüfungen, alle bestanden. Neu:
Maße der Vorlage (6,20 / 13,59 / 16,50 m), Sattelzapfen 0,73 m vor der Hinterachse, Lenkwinkel 45,8 gon und R 6,00 m,
zwei Körper ohne Faltenbalg, Gesamtlänge und Überhänge der Polygone, konstanter Abstand Zapfen–Achsgruppe, Knickwinkel einer
Wende, zu kleiner Grenzwert wird erkannt, Lenkrampen für **alle** Fahrzeuge (40 bis 300 gon: fahrbar, Lenkwinkel im Limit, keine
Sprünge), Wende mit Rampen ist breiter als mit Kreisbogen, Austrittslinien der Schablone (40 bis 200 gon).
Die Zufallsprüfungen mit vorangehendem Bogen schließen den Sattelzug aus: Nach einem engen Bogen liegt er schon nahe am
Grenzwert des Knickwinkels, dann ist eine weitere große Kurve nicht immer fahrbar. Das ist richtig so.
Im Browser (Chromium, `file://`) liefen außerdem die Oberfläche (Fahrzeugauswahl, Felder, Skalierung, Zeichnen von neun Kurven
mit dem Sattelzug) und die älteren Fahrzeuge (PKW, Müllfahrzeug mit Nachlaufachse, Gelenkbus) ohne Fehler in der Konsole.

## 4. Grenzen
- Nur die 200-gon-Kurve wurde als Leitlinie digitalisiert. Für die anderen Winkel gibt es nur die Austrittslinien (siehe 3.1) und
  den Abstand der Hüllkurven. Die Form der Rampen (`rampPow` = 2) ist ein Anpassungsgesetz an neun Messwerte, kein belegtes Gesetz.
- Bei 160 und 180 gon ist die Austrittslinie etwa 1 m zu weit außen. Die Rampen wurden nur für das Fahrzeug „Sattelzug 16,50 m“
  angepasst. Für andere Fahrzeuge bleiben sie 0 (Kreisbogen), bis es eine Schablone dafür gibt.
- Die schwarzen Linien der Schablone (vermutlich Radspuren) und die Radstellung wurden nicht geprüft.
- Der Auflieger kann bei großem Knickwinkel an die Kabine stoßen. Das Programm prüft das nicht. Die Schablone zeigt es auch nicht.
- Die Rampen gelten nur für „Kurve nach Winkel“. Ecken (G) und „Bogen durch Punkt“ (B) haben weiter keine Lenkübergänge.
