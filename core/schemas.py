"""Pydantic-Schemas fuer die strukturierten LLM-Outputs.

Kernidee: Ablehnungsgruende sind ein Enum (keine Freitexte), damit die
Analytics-Seite sie einfach zaehlen und als Diagramm darstellen kann.
"""

from enum import Enum

from pydantic import BaseModel, Field


class Kriterium(str, Enum):
    BERUFSERFAHRUNG = "berufserfahrung"
    SKILLS = "skills"
    AUSBILDUNG = "ausbildung"
    SPRACHKENNTNISSE = "sprachkenntnisse"


class DokumentTyp(str, Enum):
    LEBENSLAUF = "lebenslauf"
    MOTIVATIONSSCHREIBEN = "motivationsschreiben"
    SONSTIGES = "sonstiges"


class KOGrund(str, Enum):
    """K.O.-Kriterien: fuehren ohne LLM-Bewertung zur direkten Ablehnung."""

    LEBENSLAUF_FEHLT = "lebenslauf_fehlt"
    MOTIVATIONSSCHREIBEN_FEHLT = "motivationsschreiben_fehlt"


class AblehnungsGrund(str, Enum):
    ZU_WENIG_BERUFSERFAHRUNG = "zu_wenig_berufserfahrung"
    FEHLENDE_KERN_SKILLS = "fehlende_kern_skills"
    UNPASSENDE_AUSBILDUNG = "unpassende_ausbildung"
    FEHLENDE_SPRACHKENNTNISSE = "fehlende_sprachkenntnisse"
    FALSCHE_FACHRICHTUNG = "falsche_fachrichtung"
    UEBERQUALIFIZIERT = "ueberqualifiziert"
    LUECKENHAFTER_LEBENSLAUF = "lueckenhafter_lebenslauf"


# Menschenlesbare Labels fuer UI und Diagramme
GRUND_LABELS = {
    AblehnungsGrund.ZU_WENIG_BERUFSERFAHRUNG: "Zu wenig Berufserfahrung",
    AblehnungsGrund.FEHLENDE_KERN_SKILLS: "Fehlende Kern-Skills",
    AblehnungsGrund.UNPASSENDE_AUSBILDUNG: "Unpassende Ausbildung",
    AblehnungsGrund.FEHLENDE_SPRACHKENNTNISSE: "Fehlende Sprachkenntnisse",
    AblehnungsGrund.FALSCHE_FACHRICHTUNG: "Falsche Fachrichtung",
    AblehnungsGrund.UEBERQUALIFIZIERT: "Ueberqualifiziert",
    AblehnungsGrund.LUECKENHAFTER_LEBENSLAUF: "Lueckenhafter Lebenslauf",
}

KRITERIUM_LABELS = {
    Kriterium.BERUFSERFAHRUNG: "Berufserfahrung",
    Kriterium.SKILLS: "Skills",
    Kriterium.AUSBILDUNG: "Ausbildung",
    Kriterium.SPRACHKENNTNISSE: "Sprachkenntnisse",
}

KO_LABELS = {
    KOGrund.LEBENSLAUF_FEHLT: "Kein Lebenslauf eingereicht",
    KOGrund.MOTIVATIONSSCHREIBEN_FEHLT: "Kein Motivationsschreiben eingereicht",
}

DOKUMENT_LABELS = {
    DokumentTyp.LEBENSLAUF: "Lebenslauf",
    DokumentTyp.MOTIVATIONSSCHREIBEN: "Motivationsschreiben",
    DokumentTyp.SONSTIGES: "Sonstiges",
}

# Englische Pendants: /api/labels liefert beide Sprachen, das Frontend
# waehlt nach der eingestellten UI-Sprache aus.
GRUND_LABELS_EN = {
    AblehnungsGrund.ZU_WENIG_BERUFSERFAHRUNG: "Not enough work experience",
    AblehnungsGrund.FEHLENDE_KERN_SKILLS: "Missing core skills",
    AblehnungsGrund.UNPASSENDE_AUSBILDUNG: "Education does not match",
    AblehnungsGrund.FEHLENDE_SPRACHKENNTNISSE: "Missing language skills",
    AblehnungsGrund.FALSCHE_FACHRICHTUNG: "Wrong field of specialization",
    AblehnungsGrund.UEBERQUALIFIZIERT: "Overqualified",
    AblehnungsGrund.LUECKENHAFTER_LEBENSLAUF: "Gaps in the CV",
}

KRITERIUM_LABELS_EN = {
    Kriterium.BERUFSERFAHRUNG: "Work experience",
    Kriterium.SKILLS: "Skills",
    Kriterium.AUSBILDUNG: "Education",
    Kriterium.SPRACHKENNTNISSE: "Language skills",
}

KO_LABELS_EN = {
    KOGrund.LEBENSLAUF_FEHLT: "No CV submitted",
    KOGrund.MOTIVATIONSSCHREIBEN_FEHLT: "No cover letter submitted",
}

DOKUMENT_LABELS_EN = {
    DokumentTyp.LEBENSLAUF: "CV",
    DokumentTyp.MOTIVATIONSSCHREIBEN: "Cover letter",
    DokumentTyp.SONSTIGES: "Other",
}


class DokumentKlassifikation(BaseModel):
    """Strukturierter Output der Dokument-Klassifikation."""

    typ: DokumentTyp = Field(
        description="lebenslauf = CV/tabellarischer Werdegang (auch Teil-Dokumente), "
        "motivationsschreiben = Anschreiben/Motivationsschreiben, "
        "sonstiges = alles andere (Zeugnisse, Zertifikate, ...)"
    )


class DokumentSegment(BaseModel):
    """Ein zusammenhaengender Seitenbereich innerhalb eines Sammel-PDFs."""

    start_seite: int = Field(ge=1, description="Erste Seite des Segments (1-basiert)")
    end_seite: int = Field(ge=1, description="Letzte Seite des Segments (einschliesslich)")
    typ: DokumentTyp


class PdfAufteilung(BaseModel):
    """Strukturierter Output der Posteingang-Sortierung (Bulk-Upload)."""

    kandidat: str | None = Field(
        default=None,
        description="Vollstaendiger Name der Bewerberin/des Bewerbers, falls "
        "aus den Unterlagen erkennbar; sonst null",
    )
    segmente: list[DokumentSegment] = Field(
        description="Segmente in Seitenreihenfolge; decken alle Seiten "
        "lueckenlos und ueberlappungsfrei ab"
    )


class KriteriumScore(BaseModel):
    """Bewertung eines einzelnen Kriteriums."""

    kriterium: Kriterium
    score: int = Field(
        ge=1, le=10,
        description="1 = Anforderung gar nicht erfuellt, 10 = uebertrifft die Anforderungen",
    )
    begruendung: str = Field(description="Kurze Begruendung des Scores (2-3 Saetze)")
    belege: list[str] = Field(
        description="Woertliche Zitate aus dem Lebenslauf, die den Score belegen"
    )


class Bewertung(BaseModel):
    """Strukturierte Gesamtbewertung eines CVs gegen die Stellenausschreibung."""

    kriterien: list[KriteriumScore] = Field(
        description="Genau eine Bewertung pro Kriterium (alle vier Kriterien)"
    )
    staerken: list[str] = Field(
        description="Die 2-3 groessten Staerken des Kandidaten fuer diese Stelle"
    )
    ablehnungsgruende: list[AblehnungsGrund] = Field(
        description="Nur klar zutreffende Schwachstellen-Kategorien; leere Liste, wenn keine zutrifft"
    )
    zusammenfassung: str = Field(description="Gesamteinschaetzung in 2-3 Saetzen")


class KritikUrteil(BaseModel):
    """Urteil der Selbstkritik: Ist die Bewertung durch das CV gedeckt?"""

    belegt: bool = Field(
        description="True, wenn alle Scores durch die Zitate gedeckt sind und die Zitate sich im CV wiederfinden"
    )
    maengel: list[str] = Field(
        description="Konkrete Beanstandungen, falls die Bewertung nicht belegt ist; sonst leere Liste"
    )
