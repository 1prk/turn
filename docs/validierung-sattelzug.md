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
| F5 | Die Wende war ein Kreisbogen ohne Lenkübergänge. Die Schablone hat sie. Der Versatz der Austrittslinie war bei 200 gon 11,99 m statt 13,1 m. | Lenkrampen (`rampIn`, `rampOut`, Tabelle `rampTable`), siehe unten. |

## 2. Lenkrampen (F5)

Fahrweise 1 sagt: Der Fahrer lenkt **während der Fahrt** stetig ein und stetig aus. Das Programm hatte das bisher nicht umgesetzt.
Jetzt gilt für „Kurve nach Winkel“, wenn ein Fahrzeug Rampen hat:

- Der Lenkwinkel ändert sich mit konstanter Rate über der Wegstrecke: in `rampIn` Metern von 0 bis zum vollen Einschlag, in
  `rampOut` Metern zurück auf 0.
- Die Bahn der Vorderachse ergibt sich aus dem Einspurmodell (Richtungsänderung je Meter = sin(Lenkwinkel) / Radstand).
  Das Fahrzeug dreht sich also auch noch, während die Lenkung zurückgeht.
- Dazwischen bleibt der Lenkwinkel konstant (Radius R). Die Länge dieses Teils wird so gesucht, dass die Richtungsänderung genau
  stimmt. Bei kurzen Kurven wird der Spitzenwinkel kleiner.
- Ohne Rampen (`rampIn = rampOut = 0`, alle anderen Fahrzeuge) ist das Verhalten unverändert (Kreisbogen).
- Ein Fahrzeug kann statt der festen Längen eine **Tabelle** `rampTable` haben: Zeilen `[Richtungsänderung in gon, rampIn, rampOut]`.
  Zwischen den Zeilen wird interpoliert. Der Sattelzug hat eine Tabelle mit den neun Kurven der Schablone.
- Die Rampen gelten nur für „Kurve nach Winkel“ (K, W), nicht für Ecken (G) und Bogen durch Punkt (B).
- Die Rampen setzen voraus, dass das Fahrzeug am Anfang der Kurve gerade steht (wie nach einer Geraden).

**Erste Fassung:** Ein einziges Gesetz für alle Winkel (`rampOut` = 24 m bei 200 gon, kürzer mit dem Quadrat des Winkels) lag im Mittel
0,42 m neben den blauen Linien der Schablone, bei 160 und 180 gon war die Austrittslinie bis 1,2 m falsch. Das war nicht genau genug.

**Jetzt:** Für jede der neun Kurven sind `rampIn` und `rampOut` einzeln an die Schablone angepasst. Das Ziel war der mittlere Abstand der
berechneten Hüllkurve zu den Linien der Schablone und der gemessene Austrittsversatz. Die Lenkung beginnt bei allen Kurven an derselben
Stelle: 3,75 m vor der Vorderkante des Fahrzeugs im Startbild (5,18 m nach der Vorderachse).

| gon | rampIn [m] | rampOut [m] |
|---|---|---|
| 40 | 1,10 | 2,50 |
| 60 | 1,00 | 6,00 |
| 80 | 0,90 | 5,50 |
| 100 | 1,00 | 6,00 |
| 120 | 1,00 | 0,55 |
| 140 | 1,20 | 4,00 |
| 160 | 1,30 | 5,00 |
| 180 | 2,30 | 14,00 |
| 200 | 1,30 | 24,50 |

Die Werte sind nicht glatt (120 gon hat die kürzeste Rampe). Die Messung hat 120 gon mit 0,55 m klar bevorzugt (Zielwert 0,078 gegen 0,092 bei 2 m).
Die Form der Schablone (Kurven bis 100 gon: Rampe aus 2,5 bis 6 m; ab 180 gon lang) folgt vermutlich aus der Steuerung der Schablonen-Software.
Sie ist nicht belegt. Für Winkel zwischen den neun Kurven interpoliert das Programm.

## 3. Prüfung nach den Änderungen

Alle Werte: Programm gegen Schablone. Die Schablone ist ein Bild (Maßstab 16,3 px/m, ein Pixel = 0,06 m).

### 3.1 Hüllkurve, alle neun Winkel
Abstand der berechneten Hüllkurve (Zugmaschine und Auflieger, ohne Startbild und Endkappe) zur nächsten Linie der Schablone:

| gon | Mittel [m] | 95 % [m] | größter [m] | innerhalb 0,25 m | Austrittsversatz, Fehler [m] |
|---|---|---|---|---|---|
| 40 | 0,036 | 0,09 | 0,17 | 100 % | 0,00 |
| 60 | 0,048 | 0,12 | 0,18 | 100 % | 0,00 |
| 80 | 0,044 | 0,14 | 0,19 | 100 % | −0,17 |
| 100 | 0,057 | 0,14 | 0,25 | 100 % | 0,00 |
| 120 | 0,077 | 0,17 | 0,25 | 100 % | 0,00 |
| 140 | 0,041 | 0,12 | 0,26 | 99 % | −0,12 |
| 160 | 0,043 | 0,14 | 0,22 | 100 % | −0,09 |
| 180 | 0,089 | 0,31 | 0,43 | 91 % | −0,05 |
| 200 | 0,093 | 0,33 | 0,41 | 87 % | −0,02 |
| alle | **0,059** | 0,17 | | 98 % | RMS 0,08 |

Zum Vergleich die erste Fassung (ein Gesetz für alle Winkel): Mittel 0,42 m, Austrittsversatz RMS 0,60 m. Mit dem reinen Kreisbogen: Mittel 0,58 m,
RMS 0,86 m. Ein Pixel der Schablone ist 0,06 m. Die Werte bis 160 gon liegen also bei ein bis zwei Pixeln. Bei 180 und 200 gon bleibt eine
Abweichung bis 0,4 m an einzelnen Stellen. Die Rampen können dort mit zwei Längen die Form der Schablone nicht ganz erreichen.

### 3.2 Endstellung
Die Fahrzeuge im Programm stehen am Ende auf den Fahrzeugen der Schablone: Die Vorderachse jeder Kurve liegt 44,8 m (200 gon) bis 51,2 m
(40 gon) vom Start, gemessen an der roten Endkappe der Schablone.

### 3.3 Selbsttest im Programm
`Sim.selfTest()` (Schaltfläche „Kinematik prüfen“) hat jetzt 65 Prüfungen, alle bestanden. Neu:
Maße der Vorlage (6,20 / 13,59 / 16,50 m), Sattelzapfen 0,73 m vor der Hinterachse, Lenkwinkel 45,8 gon und R 6,00 m,
zwei Körper ohne Faltenbalg, Gesamtlänge und Überhänge der Polygone, konstanter Abstand Zapfen–Achsgruppe, Knickwinkel einer
Wende, zu kleiner Grenzwert wird erkannt, Lenkrampen für **alle** Fahrzeuge (40 bis 300 gon: fahrbar, Lenkwinkel im Limit, keine
Sprünge), Wende mit Rampen ist breiter als mit Kreisbogen, Austrittslinien der Schablone (40 bis 200 gon, auf 0,25 m genau),
äußerster Punkt der Leitlinie bei 200 gon (−6,44 m in der Schablone).
Die Zufallsprüfungen mit vorangehendem Bogen schließen den Sattelzug aus: Nach einem engen Bogen liegt er schon nahe am
Grenzwert des Knickwinkels, dann ist eine weitere große Kurve nicht immer fahrbar. Das ist richtig so.
Im Browser (Chromium, `file://`) liefen außerdem die Oberfläche (Fahrzeugauswahl, Felder, Skalierung, Zeichnen von neun Kurven
mit dem Sattelzug) und die älteren Fahrzeuge (PKW, Müllfahrzeug mit Nachlaufachse, Gelenkbus) ohne Fehler in der Konsole.

## 4. Grenzen
- Die Rampentabelle gilt für den Sattelzug und nur, wenn die Kurve 3,75 m vor der Vorderkante des Fahrzeugs im Startbild beginnt (so ist die
  Schablone gezeichnet). Beginnt der Benutzer die Kurve woanders, ist die Form dieselbe, aber verschoben.
- Die Tabelle ist an das Bild der Schablone angepasst (neun Kurven, Messfehler etwa ein Pixel = 0,06 m). Zwischen den Kurven wird interpoliert.
  Sie ist keine Aussage über das Fahren eines echten Sattelzugs.
- Bei 180 und 200 gon bleiben Abweichungen bis 0,4 m an einzelnen Stellen.
- Die schwarzen Linien der Schablone (vermutlich Radspuren) und die Radstellung wurden nicht geprüft.
- Der Auflieger kann bei großem Knickwinkel an die Kabine stoßen. Das Programm prüft das nicht. Die Schablone zeigt es auch nicht.
- Die Rampen gelten nur für „Kurve nach Winkel“. Ecken (G) und „Bogen durch Punkt“ (B) haben weiter keine Lenkübergänge.
