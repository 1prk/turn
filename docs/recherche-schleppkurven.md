# Recherche: Wie funktionieren Schleppkurven?

Stand der Recherche: Oktober 2026. Konsolidierte Befunde und ihre Anwendung in dieser Anwendung.

**Einschränkung:** Die Umgebung hat den direkten Abruf der Quellseiten gesperrt (Netzwerkrichtlinie). Die Befunde
stammen aus den Zusammenfassungen von Websuchen und nicht aus den Originaltexten. Die RBSV 2020 selbst ist
kostenpflichtig (FGSV-Verlag) und wurde nicht gelesen. Aussagen sind deshalb mit einer Verlässlichkeit gekennzeichnet.

## 1. Regelwerk (Deutschland)

| Befund | Quelle | Verlässlichkeit |
|---|---|---|
| Die **RBSV 2020** (FGSV 287, „Richtlinien für Bemessungsfahrzeuge und Schleppkurven zur Überprüfung der Befahrbarkeit von Verkehrsflächen“) ersetzt die Ausgabe 2001. Das BMV hat sie mit ARS 02/2021 eingeführt. | [FGSV Verlag](https://www.fgsv-verlag.de/rbsv), [ARS 02/2021 (Baden-Württemberg)](https://vm.baden-wuerttemberg.de/fileadmin/redaktion/m-mvi/intern/Dateien/MobiZ/Az_2-3942-13-2-2.pdf) | hoch |
| Die **Schleppkurvenschablonen gelten für Richtungsänderungswinkel von 40 bis 200 gon.** Ein Wenden in einem Zug ist also eine Kurve mit 200 gon. | [Inhaltsverzeichnis RBSV (GBV)](https://www.gbv.de/dms/weimar/toc/1755317069_toc.pdf) | mittel (nur Inhaltsverzeichnis) |
| Die Schablonen enthalten einen Sicherheitsabstand. Die Quellen widersprechen sich (30 cm oder 50 cm). | GBV, [PathSweeper](https://pathsweeper.com/de/guides/rbsv-2020-bemessungsfahrzeuge) | niedrig |
| 2020: 85-%-Bemessungsfahrzeuge in 8 Gruppen. 2001: 13 Fahrzeugklassen, je mit 2 Fahrweisen. | [TÜV SÜD (Seitz/Müller)](https://www.tuvsud.com/de-de/-/media/de/industry-service/pdf/event-downloads/is/bautechnik-aktuell-20211130/neue-richtlinie-bemessungsfahrzeuge---alfred-seitz-willibald-mueller.pdf) | mittel |
| Eine Schleppkurve entsteht aus den **Außenmaßen des Fahrzeugs und der Achslage**. Ihre Form hängt auch vom Fahrverhalten ab. Die Wahl der Leitlinie ist zentral. | [Vortrag Blanke/Ambosius 2019](https://www.medebach.de/fileadmin/user_upload/2019-09-13-Blanke-Ambosius.pdf) | mittel |

### Die zwei Fahrweisen
- **Fahrweise 1:** Der Lenkeinschlag erfolgt **während der Fahrt**. Geraden und Kreisbögen schließen tangential an,
  es entsteht kein Knick. Übergangsbögen sind sehr klein und werden vernachlässigt. Der Fahrer lenkt stetig
  zunehmend ein und stetig abnehmend aus. Der Außenradius entspricht dem Wendekreisradius. Ergebnis: breitere, aber
  realistische Schleppkurve. (BBSoft, PathSweeper)
- **Fahrweise 2:** Der Fahrer lenkt **im Stand** ein und fährt dann an. Der Übergang Gerade–Bogen ist abrupt. Ergebnis:
  die kompakteste Kurve. Sie bildet nur echte Rangiervorgänge ab. (BBSoft, PathSweeper)

Quellen: [BBSoft](https://www.bbsoft.de/cont/cont_strassenplanung_schleppkurve.php),
[PathSweeper](https://pathsweeper.com/de/blog/schleppkurvennachweis). Die Definitionen stimmen mit dem Text überein,
den du für Fahrweise 1 angegeben hast.

## 2. Wie Schleppkurven-Software arbeitet (AutoTURN, Vehicle Tracking)

Quelle: Online-Hilfe [AutoTURN Pro 2024](https://onlinehelp.transoftsolutions.com/autoturn/EN/12-0/SmartPathTools_GenerateCornerPath.html)
(über Suchergebnisse, nicht direkt gelesen).

- **Generate Arc Path:** Die einfachste und häufigste Art. Sie erzeugt einen Kreisbogen **von der Startposition zur
  Mausposition**. Man bewegt die Maus in Fahrtrichtung. Das entspricht dem Modus „Bogen durch Punkt“ (B).
- **Generate Corner Path:** Eine Kurve aus **Eingangstangente, Bogen und Ausgangstangente**. Man gibt **Radius und
  Drehwinkel (Sweep)** vor. Der Sweep ist der Winkel zwischen der Fahrtrichtung und der Ausgangstangente. Ein Sweep von
  200 gon ergibt eine Wende. Der Radius darf nicht unter den Mindestradius des Fahrzeugs fallen. Für einen größeren
  Radius müssen die Tangenten länger werden. Das entspricht dem Modus „Kurve nach Winkel“ (K).
- **Übergangszone:** Die SmartPath-Werkzeuge drehen die Räder mit konstanter Geschwindigkeit (aus der Zeit von Anschlag
  zu Anschlag) bis zum nötigen Winkel. Das ergibt Spiral-Übergänge. Fahrweise 1 der RBSV vernachlässigt sie.
- **„Turn Wheels From Stop“:** Das Fahrzeug lenkt im Stand ein. Nur bei höchstens 10 km/h und nur bei Arc Path und
  Corner Path. Das entspricht der Fahrweise 2.
- Die Schablonen-Funktion (Standard-Schleppkurvenschablonen) benutzt diese Spiralen nicht.

## 3. Mathematik

| Aussage | Herkunft | Verlässlichkeit |
|---|---|---|
| Einspurmodell: Die Hinterachse bleibt tangential zu ihrer Bahn. Läuft die Vorderachse auf einer Geraden, fährt die Hinterachse eine **Traktrix**. | arXiv 1207.0834 (Tabachnikov u. a.) | hoch |
| Stationär (Kreisfahrt) gilt: R_hinten = √(R_vorn² − Radstand²). Der Fahrzeugwinkel läuft der Bahn nach. | eigene Herleitung, im Selbsttest bestätigt | hoch |
| Vorwärtsfahrt mit Mindestradius (Dubins): Die kürzesten Wege bestehen aus Kreisbögen und Geraden (CSC oder CCC). Rückwärtsfahrt (Reeds-Shepp) erweitert das Modell. | [LaValle, Planning Algorithms 15.3.1](https://lavalle.pl/planning/node821.html), Dubins 1957 | hoch |
| Bei konstanter Geschwindigkeit und konstanter Lenkgeschwindigkeit ist die Bahn eine **Klothoide**. | arXiv 2308.01117, VT-Dissertation | mittel |
| Eine Wende in einem Zug braucht mindestens den **Wendekreisdurchmesser** (2·R) als Breite. | eigener Schluss, nicht belegt | niedrig |

## 4. Praxiswerte
- § 32d StVZO (Kurvenlaufeigenschaften): Wendekreisradius 12,50 m. [bussgeldkatalog.net](https://www.bussgeldkatalog.net/strassenverkehrszulassungsordnung/32d-stvzo/)
- Wendeplätze mit mindestens 25 × 25 m, damit jedes Fahrzeug in einem Zug wenden kann: Forenbeitrag, niedrige Verlässlichkeit.
- 180-Grad-Wende, Bus oder Einzel-Lkw: Innenradius mindestens etwa 8,64 m (AASHTO-Wert über dimensions.com), niedrige Verlässlichkeit.
- Der Wendekreis ist nur eine Kenngröße bei maximalem Lenkeinschlag. Die Schleppkurve umfasst die ganze überstrichene
  Fläche, von der äußersten Vorderecke bis zum innersten Hinterrad.

## 5. Anwendung in dieser Anwendung

| Befund | Umsetzung |
|---|---|
| Eine Wende ist eine Kurve mit 200 gon (RBSV: 40–200 gon). | **Kurve nach Winkel (K)** mit Feld „Richtungsänderung [gon]“. Taste **W** wählt direkt 200 gon. Bis 390 gon. |
| Corner Path: Radius und Sweep vorgeben, Radius nicht unter Mindestradius. | Feld „Radius“. Standard ist der Mindestradius (Wendekreis, Fahrweise 1). Kleinere Werte sind nicht möglich. |
| Arc Path: Bogen von der Startposition zur Maus. | **Bogen durch Punkt (B)** (seit der letzten Version). |
| Die Kurve beginnt an der aktuellen Fahrzeugposition, Tangente davor und danach. | Die Kurve beginnt am Ende der Fahrlinie. Davor kann eine Gerade liegen. Danach läuft eine Gerade tangential. |
| Fahrweise 1: Einschlag während der Fahrt, tangential, Außenradius = Wendekreis. | Unverändert. Der Einschlag ergibt sich aus dem Nachlaufen der Hinterachse. |
| Fahrweise 2 (Einschlag im Stand). | Noch nicht umgesetzt. Nächster Schritt. |
| Hüllkurve, Sicherheitsabstand. | Hüllkurve aus den vier Karosserieecken. Ein Sicherheitsabstand fehlt noch. |
