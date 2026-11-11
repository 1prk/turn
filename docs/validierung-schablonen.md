# Validierung: Müllfahrzeug, Reisebus und Gelenkbus gegen ihre Schablonen (A3, 1:250)

Das gleiche Verfahren wie beim Sattelzug ([validierung-sattelzug.md](validierung-sattelzug.md)): Jede Schablone hat neun Kurven mit 40 bis 200 gon in
Schritten von 20 gon. Magenta ist die Leitlinie der Vorderachsmitte, blau die Hüllkurve, rot die Hüllkurve mit 0,5 m Sicherheitsabstand.
Die Schablonen von Müllfahrzeug und Reisebus beginnen nach oben und biegen nach rechts ab. Zum Messen wurden sie um 90° in die Lage der
anderen Schablonen gedreht (Start nach links).

| | Reisebus 12 m | Müllfahrzeug 3-achsig (3Mü) | Gelenkbus 3-achsig |
|---|---|---|---|
| Länge | 12,00 m | 9,90 m | 18,00 m |
| Überhang vorn | 2,80 m | 1,53 m | 2,70 m |
| Radstand | 5,90 m | 4,77 m (bis Mitte der Hinterachsen) | 5,90 m und 6,00 m |
| Überhang hinten | 3,30 m | 3,60 m | 3,40 m |
| Breite | 2,55 m | 2,55 m | 2,55 m |
| Wendekreis außen (Radius) | 10,50 m | 10,25 m | 11,40 m |

Der Reisebus „Reise-/Linienbus 12,0 m“ war noch kein Fahrzeug im Programm. Er ist jetzt die Voreinstellung 7. Die anderen beiden gab es schon.
Maßstab aus dem gezeichneten Startfahrzeug: bei allen vier Schablonen 16,3 px/m (ein Pixel = 0,06 m).

## 1. Die Fahrzeugmodelle stimmen schon

Vor dem Anpassen wurde geprüft, ob die Fahrzeuge im Programm zur Schablone passen. Die Leitlinie der Schablone folgt bei vollem Einschlag einem
Kreis. Dessen Radius (Kreisanpassung an die Magenta-Linie) ist der Radius der Vorderachse am Anschlag, und sein Mittelpunkt liegt im Abstand
des Hinterachsradius von der Startachse:

| | Kreis der Schablone | Programm (aus dem Wendekreis) | Abstand Mittelpunkt–Startachse | Hinterachsradius im Programm |
|---|---|---|---|---|
| Reisebus | 7,41 m | 7,48 m | 4,63 m | 4,60 m |
| Müllfahrzeug | 8,26 m | 8,31 m | 6,81 m | 6,81 m |
| Gelenkbus | 8,50 m | 8,56 m | 6,24 m | 6,21 m |

Die Werte stimmen auf 0,1 m. Die Wendekreise und Maße der Voreinstellungen sind also richtig. Der Versatz der Austrittslinie bei 200 gon ist
deshalb nicht 2 · R der Vorderachse, sondern etwa 2 · Hinterachsradius (Reisebus 9,2 m, Müllfahrzeug 13,7 m).

## 2. Ergebnis

Wie beim Sattelzug lenkt die Schablone nicht sofort voll ein, sondern mit Rampen. Mit dem einfachen Kreisbogen (ohne Rampen) liegt die
Hüllkurve im Mittel 0,45 m (Müllfahrzeug), 0,73 m (Reisebus) und 1,04 m (Gelenkbus) neben den Linien der Schablone.
Mit Rampen, die für jede der neun Kurven angepasst sind (`rampTable` im Fahrzeug, Verfahren siehe Sattelzug), gilt:

| Fahrzeug | Mittel [m] | 95 % [m] | größter [m] | Austrittsversatz RMS [m] | Lenkung beginnt |
|---|---|---|---|---|---|
| Reisebus 12 m | **0,030** | 0,09 | 0,26 | 0,02 | 5,25 m nach der Vorderachse |
| Müllfahrzeug | **0,024** | 0,08 | 0,22 | 0,02 | 5,25 m nach der Vorderachse |
| Gelenkbus | **0,036** | 0,13 | 0,37 | 0,04 | 5,25 m nach der Vorderachse |

Mittel, 95 % und größter Wert: Abstand der berechneten Hüllkurve (ohne Startbild und Endkappe) zur nächsten Linie der Schablone, Mittel über alle
neun Kurven. Das sind etwa ein halbes bis ein Pixel. Beim Sattelzug beginnt die Lenkung 5,18 m nach der Vorderachse. Bei allen vier Schablonen ist das fast gleich.
Kein Winkel wird vom Programm begrenzt, keiner ist unfahrbar, und die Lenkung erreicht bei jeder Kurve genau den Anschlag, wie in der Schablone.

### Je Winkel (Programm, mit Tabelle)

| gon | Reisebus Mittel | Müllfahrzeug Mittel | Gelenkbus Mittel | Gelenkbus Knick [gon] |
|---|---|---|---|---|
| 40 | 0,029 | 0,018 | 0,021 | 33,8 |
| 60 | 0,036 | 0,023 | 0,032 | 44,1 |
| 80 | 0,038 | 0,015 | 0,057 | 50,5 |
| 100 | 0,016 | 0,017 | 0,027 | 53,1 |
| 120 | 0,031 | 0,027 | 0,017 | 57,5 |
| 140 | 0,036 | 0,032 | 0,024 | 59,3 |
| 160 | 0,026 | 0,023 | 0,039 | 60,1 |
| 180 | 0,025 | 0,036 | 0,057 | 61,3 |
| 200 | 0,030 | 0,023 | 0,050 | 61,8 |

Der Knickwinkel des Gelenkbusses erreicht 61,8 gon. Sein Grenzwert im Programm ist 65 gon. Das ist kein Herstellerwert (siehe Recherche), aber die Schablone
braucht mindestens 62 gon.

### Rampentabellen (Zeilen: gon, Rampe ein [m], Rampe aus [m])
- Reisebus: 40: 1,35 / 2,25, 60: 1,20 / 4,75, 80: 1,00 / 4,00, 100: 1,10 / 0,30, 120: 1,00 / 0,30, 140: 1,00 / 0,05, 160: 1,15 / 3,55, 180: 1,15 / 0,05, 200: 1,15 / 0,05
- Müllfahrzeug: 40: 1,35 / 0,05, 60: 1,00 / 2,80, 80: 1,20 / 2,05, 100: 1,05 / 1,75, 120: 1,00 / 2,00, 140: 1,00 / 4,05, 160: 1,10 / 3,75, 180: 1,00 / 0,30, 200: 1,15 / 3,05
- Gelenkbus: 40: 1,00 / 2,00, 60: 1,00 / 1,30, 80: 0,70 / 1,05, 100: 1,00 / 3,25, 120: 0,95 / 0,30, 140: 0,90 / 0,05, 160: 0,70 / 1,75, 180: 0,50 / 0,05, 200: 1,10 / 0,05

Die Rampe ein ist bei allen Fahrzeugen etwa 1 m. Die Rampe aus streut zwischen 0,05 und 4,75 m. Bei den Kurven mit sehr kurzer Rampe aus ist der Zielwert zwischen
0,05 und 1 m flach: Der mittlere Abstand ändert sich dort um weniger als 0,002 m (geprüft bei vier Kurven: Reisebus 140 und 200 gon, Müllfahrzeug 180 gon,
Gelenkbus 140 gon). Mit 4 m wird er dagegen schlechter (0,055 bis 0,069 m statt 0,025 bis 0,038 m). Die Werte 0,05 m sind also „sofort zurücklenken“, keine Messgröße.

## 3. Selbsttest
`Sim.selfTest()` hat jetzt 74 Prüfungen, alle bestanden. Neu je Fahrzeug: die neun Austrittslinien der Schablone auf 0,25 m genau (größte Abweichung
0,04 / 0,05 / 0,12 m), keine Kurve begrenzt oder unfahrbar, und der Leitkreis der Schablone entspricht dem Radius der Vorderachse am Anschlag.

Bei der Arbeit zeigte sich eine Einschränkung der Rampen. Sie setzen voraus, dass das Fahrzeug am Anfang der Kurve in der Richtung des Weges steht.
Das gilt nach einer Geraden, aber nicht nach einem Bogen. **Folgt die Kurve auf einen Bogen oder eine andere Kurve, fährt das Programm jetzt einen
einfachen Kreisbogen** (wie bisher). Ohne diese Regel waren einzelne Kombinationen unfahrbar.

## 4. Grenzen
- Die Tabellen sind an die Bilder der Schablonen angepasst (Messfehler etwa ein Pixel). Zwischen den Kurven wird interpoliert.
  Sie sagen nichts über das Fahren eines echten Fahrzeugs.
- Sie passen nur, wenn die Kurve 5,25 m nach der Vorderachse beginnt, wie in der Schablone.
- Bei der Schablone des Gelenkbusses sind die Kurven bei 100 und 120 gon am oberen Bildrand abgeschnitten. Dort fehlt ein Stück der Endlage.
- Die schwarzen Linien (Radspuren) und die Radstellung wurden nicht geprüft.
- Beim Müllfahrzeug mit Nachlaufachse und bei PKW und LKW gibt es keine Schablone. Sie fahren weiter einen Kreisbogen.
