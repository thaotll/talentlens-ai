"""Erzeugt fiktive Test-Bewerbungen als PDFs in data/test_cvs/<kandidat>/.

Eine Bewerbung = ein Ordner mit einer oder mehreren PDFs:

- anna_schmidt/   stark:      CV + Motivationsschreiben -> sollte weit oben landen
- ben_keller/     mittel:     NUR CV -> fliegt per K.O. raus, wenn
                              "Motivationsschreiben erforderlich" aktiv ist
- clara_witt/     schwach:    CV + Motivationsschreiben, fachfremd
- david_okafor/   grenzfall:  ZWEITEILIGER CV + Motivationsschreiben
                              (testet Klassifikation + Zusammenfuehren)
- eva_lang/       layoutfalle: zweispaltiger CV + Motivationsschreiben
                              (Stresstest fuer die Text-Extraktion)

Hinweis: nur ASCII/Latin-1-Zeichen verwenden (fpdf2-Core-Fonts).
"""

import sys
from pathlib import Path

from fpdf import FPDF

ZIEL = Path(__file__).resolve().parents[1] / "data" / "test_cvs"


def einspaltig(pfad: Path, name: str, kopf: str, bloecke: list[tuple[str, str]]):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 18)
    pdf.cell(0, 10, name, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(0, 5, kopf)
    pdf.ln(4)
    for titel, inhalt in bloecke:
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, titel, new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(0, 5, inhalt)
        pdf.ln(2)
    pdf.output(str(pfad))


def brief(pfad: Path, name: str, ort: str, text: str):
    """Motivationsschreiben als Fliesstext-Brief."""
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(0, 5, f"{name}\n{ort}\n")
    pdf.ln(6)
    pdf.set_font("Helvetica", "B", 13)
    pdf.cell(0, 8, "Bewerbung als Junior Data Analyst (m/w/d)", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)
    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(0, 5.5, f"Sehr geehrte Damen und Herren,\n\n{text}\n\n"
                           f"Mit freundlichen Gruessen\n{name}")
    pdf.output(str(pfad))


# --------------------------------------------------------------------------
def anna_schmidt():
    ordner = ZIEL / "anna_schmidt"
    ordner.mkdir(parents=True, exist_ok=True)
    einspaltig(
        ordner / "lebenslauf.pdf",
        "Anna Schmidt",
        "Berlin | anna.schmidt@mail.de | +49 170 1234567 | geb. 12.03.1999",
        [
            ("Profil",
             "Datenaffine Statistikerin mit zwei Jahren Praxiserfahrung in "
             "Data Analytics. Sucht Einstieg als Junior Data Analyst."),
            ("Berufserfahrung",
             "07/2024 - heute: Werkstudentin Data Analytics, RetailMetrics GmbH, Berlin\n"
             "- Aufbau von Vertriebs-Dashboards in Tableau fuer 3 Fachbereiche\n"
             "- Datenaufbereitung mit Python (pandas) und SQL (PostgreSQL)\n"
             "- Automatisierung woechentlicher Reports (Zeitersparnis ca. 6 Std./Woche)\n\n"
             "02/2024 - 06/2024: Praktikum Business Intelligence, NordBank AG, Hamburg\n"
             "- Mitarbeit an Datenqualitaets-Checks fuer das Kundenreporting\n"
             "- SQL-Abfragen auf dem Data Warehouse (ca. 40 Tabellen)"),
            ("Ausbildung",
             "10/2022 - 09/2025: M.Sc. Statistik, HU Berlin (Note 1,7)\n"
             "Schwerpunkte: Statistische Modellierung, A/B-Testing\n"
             "10/2018 - 09/2022: B.Sc. Mathematik, Universitaet Leipzig (Note 2,0)"),
            ("Skills",
             "SQL (sehr gut, PostgreSQL/BigQuery), Python (pandas, matplotlib), "
             "Tableau (sehr gut), Power BI (Grundkenntnisse), Excel (sehr gut, "
             "inkl. Pivot/Power Query), Git"),
            ("Sprachen",
             "Deutsch (Muttersprache), Englisch (C1, Auslandssemester Manchester)"),
        ],
    )
    brief(
        ordner / "motivationsschreiben.pdf",
        "Anna Schmidt", "Berlin",
        "mit grossem Interesse habe ich Ihre Ausschreibung fuer die Position "
        "als Junior Data Analyst gelesen. In meiner Werkstudententaetigkeit bei "
        "RetailMetrics habe ich genau die Aufgaben uebernommen, die Sie "
        "beschreiben: Dashboards fuer Fachbereiche, Datenaufbereitung mit "
        "pandas und SQL sowie die Automatisierung von Reports. Die Kombination "
        "aus statistischem Fundament (M.Sc. Statistik) und Hands-on-Erfahrung "
        "moechte ich gerne bei DataVision einbringen. Besonders reizt mich Ihr "
        "Fokus auf den Mittelstand, weil Analysen dort direkt sichtbare "
        "Entscheidungen treiben.",
    )


def ben_keller():
    """Bewusst OHNE Motivationsschreiben -> K.O.-Demo."""
    ordner = ZIEL / "ben_keller"
    ordner.mkdir(parents=True, exist_ok=True)
    einspaltig(
        ordner / "lebenslauf.pdf",
        "Ben Keller",
        "Potsdam | ben.keller@mail.de | +49 160 2345678 | geb. 24.08.2000",
        [
            ("Profil",
             "BWL-Absolvent mit Controlling-Praktikum. Interesse an "
             "Datenanalyse, bisher vor allem Excel-Erfahrung."),
            ("Berufserfahrung",
             "03/2025 - 08/2025: Praktikum Controlling, Mittelstand Maschinenbau GmbH\n"
             "- Monatsreporting in Excel (Pivot-Tabellen, SVERWEIS)\n"
             "- Erste SQL-Abfragen auf dem ERP-System (Grundkenntnisse)\n\n"
             "2021 - 2024: Nebenjob Verkauf, Elektrofachmarkt Potsdam"),
            ("Ausbildung",
             "10/2021 - 09/2025: B.A. Betriebswirtschaftslehre, Uni Potsdam (Note 2,4)\n"
             "Schwerpunkt: Controlling und Rechnungswesen"),
            ("Skills",
             "Excel (sehr gut), SQL (Grundkenntnisse), PowerPoint, SAP (Grundkenntnisse). "
             "Kein Python. Erste Beruehrung mit Power BI in einer Uni-Veranstaltung."),
            ("Sprachen",
             "Deutsch (Muttersprache), Englisch (B2)"),
        ],
    )


def clara_witt():
    ordner = ZIEL / "clara_witt"
    ordner.mkdir(parents=True, exist_ok=True)
    einspaltig(
        ordner / "lebenslauf.pdf",
        "Clara Witt",
        "Cottbus | clara.witt@mail.de | +49 152 3456789 | geb. 02.11.1996",
        [
            ("Profil",
             "Erfahrene Hotelfachfrau mit Leidenschaft fuer Gaestebetreuung, "
             "sucht berufliche Neuorientierung."),
            ("Berufserfahrung",
             "08/2019 - heute: Hotelfachfrau, Parkhotel Cottbus\n"
             "- Empfang, Reservierungen, Gaestebetreuung\n"
             "- Dienstplanerstellung fuer 8 Mitarbeitende\n\n"
             "08/2016 - 07/2019: Ausbildung zur Hotelfachfrau, Parkhotel Cottbus"),
            ("Ausbildung",
             "2016: Mittlerer Schulabschluss, Oberschule Cottbus"),
            ("Skills",
             "MS Word, Outlook, Hotelsoftware Opera PMS, Kassensysteme. "
             "Excel: Grundkenntnisse (Dienstplaene)."),
            ("Sprachen",
             "Deutsch (Muttersprache), Englisch (B1, Hotelalltag)"),
        ],
    )
    brief(
        ordner / "motivationsschreiben.pdf",
        "Clara Witt", "Cottbus",
        "ich moechte mich beruflich neu orientieren und bewerbe mich daher auf "
        "Ihre Stelle als Junior Data Analyst. Im Hotel habe ich gelernt, "
        "sorgfaeltig und serviceorientiert zu arbeiten, und ich erstelle dort "
        "auch die Dienstplaene in Excel. Zahlen haben mir schon immer Spass "
        "gemacht, und ich bin sehr motiviert, mich in neue Themen einzuarbeiten.",
    )


def david_okafor():
    """Zweiteiliger CV + Motivationsschreiben -> testet das Zusammenfuehren."""
    ordner = ZIEL / "david_okafor"
    ordner.mkdir(parents=True, exist_ok=True)
    einspaltig(
        ordner / "lebenslauf_teil1.pdf",
        "David Okafor",
        "Berlin | d.okafor@mail.de | +49 176 4567890 | geb. 17.05.1994 | Seite 1/2",
        [
            ("Profil",
             "Senior-naher Backend-Entwickler mit 4 Jahren Erfahrung in "
             "verteilten Systemen. Sucht bewusst den Wechsel in die Datenanalyse."),
            ("Berufserfahrung",
             "04/2022 - heute: Backend-Entwickler, FinTech Solutions GmbH, Berlin\n"
             "- Entwicklung von Microservices (Java, Spring Boot, Kafka)\n"
             "- Design und Optimierung komplexer PostgreSQL-Datenbanken\n"
             "- Sehr gute SQL-Kenntnisse (Query-Optimierung, Indexdesign)\n\n"
             "10/2020 - 03/2022: Junior Softwareentwickler, WebAgentur Mitte, Berlin\n"
             "- REST-APIs in Java, CI/CD-Pipelines"),
        ],
    )
    einspaltig(
        ordner / "lebenslauf_teil2.pdf",
        "David Okafor",
        "Lebenslauf Seite 2/2",
        [
            ("Ausbildung",
             "10/2014 - 09/2020: M.Sc. Informatik, TU Berlin (Note 1,9)\n"
             "Schwerpunkt: Verteilte Systeme"),
            ("Skills",
             "Java (sehr gut), SQL (sehr gut), Kubernetes, Kafka, Git, Docker. "
             "Python: gelegentliche Skripte, kein pandas. Keine Erfahrung mit "
             "BI-Tools (Power BI/Tableau) oder klassischem Reporting."),
            ("Sprachen",
             "Deutsch (C2), Englisch (C1)"),
        ],
    )
    brief(
        ordner / "motivationsschreiben.pdf",
        "David Okafor", "Berlin",
        "nach vier Jahren Backend-Entwicklung im FinTech-Umfeld moechte ich "
        "naeher an die fachliche Auswertung von Daten ruecken. Durch das "
        "Datenbankdesign fuer unsere Zahlungsplattform kenne ich die "
        "Datenseite bereits sehr gut - mir fehlt bewusst noch die "
        "BI-Tool-Erfahrung, dafuer bringe ich tiefes SQL-Wissen und "
        "Engineering-Disziplin mit. Den Schritt zum Junior-Einstieg gehe ich "
        "bewusst, um das Analytics-Handwerk von Grund auf zu lernen.",
    )


def eva_lang():
    """Zweispaltiger CV - typischer Stolperstein fuer PDF-Text-Extraktion."""
    ordner = ZIEL / "eva_lang"
    ordner.mkdir(parents=True, exist_ok=True)
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_xy(10, 12)
    pdf.cell(0, 10, "Eva Lang")
    pdf.set_font("Helvetica", "I", 10)
    pdf.set_xy(10, 22)
    pdf.cell(0, 6, "Junior Analystin - Wirtschaftsinformatik")

    # Linke Spalte: Kontakt + Skills
    pdf.set_font("Helvetica", "", 9)
    pdf.set_xy(10, 36)
    pdf.multi_cell(
        55, 4.5,
        "KONTAKT\n"
        "Dresden\n"
        "eva.lang@mail.de\n"
        "+49 157 5678901\n"
        "geb. 30.01.2001\n"
        "\n"
        "SKILLS\n"
        "SQL (gut, MySQL)\n"
        "Python (Grundkenntnisse,\n"
        "pandas-Kurs absolviert)\n"
        "Power BI (gut)\n"
        "Excel (sehr gut)\n"
        "\n"
        "SPRACHEN\n"
        "Deutsch (Muttersprache)\n"
        "Englisch (B2)",
    )

    # Rechte Spalte: Erfahrung + Ausbildung
    pdf.set_xy(75, 36)
    pdf.multi_cell(
        125, 4.5,
        "BERUFSERFAHRUNG\n"
        "\n"
        "01/2025 - heute: Werkstudentin Reporting, EnergieNetz AG, Dresden\n"
        "- Pflege des monatlichen Vertriebs-Reportings in Power BI\n"
        "- Datenabzuege per SQL aus dem CRM-System\n"
        "- Plausibilitaetspruefung von Kundendaten\n"
        "\n"
        "08/2023 - 12/2024: Studentische Hilfskraft, Lehrstuhl fuer "
        "Wirtschaftsinformatik, TU Dresden\n"
        "- Aufbereitung von Umfragedaten in Excel\n"
        "\n"
        "AUSBILDUNG\n"
        "\n"
        "10/2020 - 09/2025: B.Sc. Wirtschaftsinformatik, TU Dresden (Note 2,1)\n"
        "Bachelorarbeit: Automatisierte Kennzahlen-Dashboards im Mittelstand",
    )
    pdf.output(str(ordner / "lebenslauf.pdf"))

    brief(
        ordner / "motivationsschreiben.pdf",
        "Eva Lang", "Dresden",
        "als Werkstudentin im Reporting der EnergieNetz AG betreue ich bereits "
        "heute Power-BI-Berichte und SQL-Datenabzuege - die ausgeschriebene "
        "Stelle waere fuer mich der konsequente naechste Schritt nach dem "
        "Bachelorabschluss. Meine Bachelorarbeit ueber automatisierte "
        "Kennzahlen-Dashboards im Mittelstand passt thematisch direkt zu "
        "Ihrem Kundenfokus.",
    )


def felix_brandt_komplett():
    """EIN Sammel-PDF: 2 Seiten Lebenslauf + 1 Seite Motivationsschreiben.
    Testfall fuer den Bulk-Upload (automatisches Aufteilen + Zuordnen)."""
    pdf = FPDF()

    # Seite 1: Lebenslauf, Teil 1
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 18)
    pdf.cell(0, 10, "Felix Brandt", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(0, 5, "Leipzig | felix.brandt@mail.de | +49 171 6789012 | geb. 09.07.2000")
    pdf.ln(4)
    for titel, inhalt in [
        ("Profil",
         "Wirtschaftsmathematiker mit Werkstudenten-Erfahrung im Reporting. "
         "Sucht den Einstieg als Junior Data Analyst."),
        ("Berufserfahrung",
         "06/2024 - heute: Werkstudent Business Intelligence, HandelsHof KG, Leipzig\n"
         "- Aufbau und Pflege von Power-BI-Dashboards fuer den Einkauf\n"
         "- SQL-Abfragen auf dem Data Warehouse (T-SQL)\n"
         "- Datenbereinigung mit Python (pandas, Grundkenntnisse)"),
    ]:
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, titel, new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(0, 5, inhalt)
        pdf.ln(2)

    # Seite 2: Lebenslauf, Teil 2
    pdf.add_page()
    pdf.set_font("Helvetica", "I", 9)
    pdf.cell(0, 6, "Felix Brandt - Lebenslauf, Seite 2/2", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)
    for titel, inhalt in [
        ("Ausbildung",
         "10/2020 - 09/2025: B.Sc. Wirtschaftsmathematik, Universitaet Leipzig (Note 2,2)\n"
         "Schwerpunkt: Statistik und Operations Research"),
        ("Skills",
         "SQL (gut, T-SQL), Power BI (gut), Python (pandas, Grundkenntnisse), "
         "Excel (sehr gut), R (Grundkenntnisse aus dem Studium)"),
        ("Sprachen",
         "Deutsch (Muttersprache), Englisch (B2/C1)"),
    ]:
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, titel, new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(0, 5, inhalt)
        pdf.ln(2)

    # Seite 3: Motivationsschreiben
    pdf.add_page()
    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(0, 5, "Felix Brandt\nLeipzig\n")
    pdf.ln(6)
    pdf.set_font("Helvetica", "B", 13)
    pdf.cell(0, 8, "Bewerbung als Junior Data Analyst (m/w/d)", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)
    pdf.set_font("Helvetica", "", 10)
    pdf.multi_cell(
        0, 5.5,
        "Sehr geehrte Damen und Herren,\n\n"
        "in meiner Werkstudententaetigkeit bei der HandelsHof KG habe ich "
        "gelernt, wie viel Wirkung gute Dashboards im Einkauf entfalten - "
        "genau diese Arbeit moechte ich bei DataVision vertiefen. Mein "
        "Statistik-Schwerpunkt aus der Wirtschaftsmathematik hilft mir, "
        "Auswertungen nicht nur zu bauen, sondern auch richtig zu "
        "interpretieren.\n\nMit freundlichen Gruessen\nFelix Brandt",
    )
    pdf.output(str(ZIEL / "bewerbung_felix_brandt_komplett.pdf"))


def main():
    ZIEL.mkdir(parents=True, exist_ok=True)
    anna_schmidt()
    ben_keller()
    clara_witt()
    david_okafor()
    eva_lang()
    felix_brandt_komplett()
    anzahl = len(list(ZIEL.rglob("*.pdf")))
    print(f"{anzahl} PDFs erzeugt (5 Bewerbungs-Ordner + 1 Sammel-PDF): {ZIEL}")


if __name__ == "__main__":
    sys.exit(main())
