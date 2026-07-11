"""HR-Assistent: Tool-Calling-Agent ueber den Screening-Ergebnissen.

Die Screening-Pipeline (core/pipeline.py) ist bewusst eine deterministische
LCEL-Kette. Hier dagegen arbeitet ein echter Agent: Das LLM bekommt
Werkzeuge (LangChain @tool) und entscheidet pro Runde selbst, WELCHE es
mit WELCHEN Argumenten aufruft - oder ob es genug weiss und antwortet.
Eine Frage wie "Warum ist Ben rausgeflogen, und waere er ohne K.O. besser
als Clara?" loest so eine Mehrschritt-Kette aus: Ablehnung nachschlagen
-> Bewertungen holen -> vergleichen.

Der Agent-Loop ist mit LangChain-Primitiven gebaut (bind_tools +
ToolMessage), NICHT mit LangGraph (Projektvorgabe). Der klassische
AgentExecutor kommt ebenfalls nicht in Frage: LangChain 1.x hat ihn
entfernt, und der Nachfolger create_agent basiert intern auf LangGraph.

Sicherungen: hoechstens MAX_RUNDEN Tool-Runden, danach wird eine
Abschluss-Antwort ohne weitere Werkzeuge erzwungen. Werkzeug-Fehler
brechen den Loop nicht ab, sondern gehen als Text zurueck ans LLM,
damit es sich selbst korrigieren kann (z.B. Tippfehler im Namen).
"""

import json

from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_core.tools import tool

from core import storage
from core.config import STELLE_PFAD
from core.llm import get_llm
from core.schemas import (
    GRUND_LABELS,
    GRUND_LABELS_EN,
    KO_LABELS,
    KO_LABELS_EN,
)

MAX_RUNDEN = 5    # Tool-Runden, bevor eine Antwort erzwungen wird
MAX_VERLAUF = 20  # wie viele bisherige Chat-Nachrichten mitgeschickt werden
MAX_ZEICHEN = 4000  # Laengenbegrenzung pro Chat-Nachricht

# Antwortsprache folgt der UI-Sprache des Fragenden
_ANTWORT_REGELN = {
    "de": "Antworte auf Deutsch",
    "en": "Antworte auf Englisch (answer in English)",
}

SYSTEM_PROMPT = """Du bist der HR-Assistent von TalentLens, einem System \
fuer CV-Screening. Du beantwortest Fragen zu den bereits gescreenten \
Bewerbungen: wer gut abgeschnitten hat, warum jemand abgelehnt wurde, wie \
sich Kandidaten unterscheiden, woran Bewerbungen scheitern.

Regeln:
- Stuetze JEDE inhaltliche Aussage auf Werkzeug-Ergebnisse; erfinde nie \
Kandidaten, Scores oder Begruendungen. Rufe bei Bedarf mehrere Werkzeuge \
nacheinander auf.
- Findest du einen Namen nicht, pruefe mit liste_bewerbungen, wie die \
Kandidaten wirklich heissen.
- {antwort_regel}, kompakt und konkret, in reinem Text ohne \
Markdown-Formatierung. Nenne Scores als Zahl.
- Sei transparent: Scores sind LLM-Schaetzungen (Unterschiede unter etwa \
5 Punkten sind nicht signifikant), K.O.-Ablehnungen sind Formal-Checks \
ohne inhaltliche Bewertung, und die finale Entscheidung trifft immer ein \
Mensch.
- Fragen ohne Bezug zum Screening (Smalltalk, Allgemeinwissen, ...) lehnst \
du freundlich ab und verweist auf deinen Zweck."""


def build_werkzeuge(stelle_text: str = "", sprache: str = "de") -> list:
    """Baut die Werkzeuge des Assistenten. Alle lesen nur (SQLite bzw.
    Stellenausschreibung) - der Agent kann nichts veraendern.

    stelle_text: die aktuell im Dashboard bearbeitete Ausschreibung; leer
    -> Fallback auf die mitgelieferte Datei.
    sprache: "de"/"en" - Sprache der Label-Texte in den Tool-Ergebnissen,
    damit das LLM K.O.- und Ablehnungsgruende passend zur UI zitiert.
    """

    # Enum-Werte -> menschenlesbare Texte, damit das LLM keine Codes zitiert
    ko_labels = KO_LABELS_EN if sprache == "en" else KO_LABELS
    grund_labels = GRUND_LABELS_EN if sprache == "en" else GRUND_LABELS
    ko_texte = {k.value: v for k, v in ko_labels.items()}
    grund_texte = {g.value: v for g, v in grund_labels.items()}

    def _kurz(eintrag: dict) -> dict:
        """Kompakte Sicht auf ein Ergebnis fuer Listen und Vergleiche."""
        return {
            "kandidat": eintrag["kandidat"],
            "status": eintrag["status"],
            "empfehlung": eintrag["empfehlung"],
            "gesamt_score": eintrag["gesamt_score"],
            "ko_grund": ko_texte.get(eintrag["ko_grund"]) if eintrag["ko_grund"] else None,
            "stelle": eintrag["stelle_titel"],
            "zeitstempel": eintrag["zeitstempel"],
        }

    def _finde(kandidat: str) -> dict | None:
        """Ergebnis per Name: exakt vor Teil-Treffer, case-insensitiv."""
        gesucht = kandidat.strip().lower()
        eintraege = storage.lade_ergebnisse()
        for e in eintraege:
            if e["kandidat"].strip().lower() == gesucht:
                return e
        for e in eintraege:
            if gesucht and gesucht in e["kandidat"].lower():
                return e
        return None

    def _nicht_gefunden(kandidat: str) -> dict:
        return {
            "fehler": f"Kein Screening-Ergebnis fuer '{kandidat}' gefunden.",
            "vorhandene_kandidaten": sorted(
                {e["kandidat"] for e in storage.lade_ergebnisse()}
            ),
        }

    @tool
    def liste_bewerbungen(status: str = "alle") -> list[dict]:
        """Listet alle gescreenten Bewerbungen kompakt auf (Name, Status,
        Empfehlung, Gesamt-Score 10-100, K.O.-Grund). status filtert:
        'alle', 'genehmigt' oder 'abgelehnt'."""
        eintraege = storage.lade_ergebnisse()
        if status in ("genehmigt", "abgelehnt"):
            eintraege = [e for e in eintraege if e["status"] == status]
        return [_kurz(e) for e in eintraege]

    @tool
    def hole_bewertung(kandidat: str) -> dict:
        """Holt die vollstaendige Bewertung eines Kandidaten: Scores pro
        Kriterium mit Begruendung und woertlichen Belegen, Staerken,
        Ablehnungsgruende, Zusammenfassung und eingereichte Dokumente."""
        eintrag = _finde(kandidat)
        if eintrag is None:
            return _nicht_gefunden(kandidat)
        detail = _kurz(eintrag)
        detail["dokumente"] = eintrag["dokumente"]
        detail["durch_selbstkritik_korrigiert"] = eintrag["korrigiert"]
        bewertung = eintrag["bewertung"]
        if bewertung is None:
            detail["hinweis"] = (
                "K.O.-Ablehnung: Es gibt keine inhaltliche LLM-Bewertung."
            )
            return detail
        detail["kriterien"] = bewertung["kriterien"]
        detail["staerken"] = bewertung["staerken"]
        detail["ablehnungsgruende"] = [
            grund_texte.get(g, g) for g in bewertung["ablehnungsgruende"]
        ]
        detail["zusammenfassung"] = bewertung["zusammenfassung"]
        return detail

    @tool
    def vergleiche_kandidaten(kandidaten: list[str]) -> dict:
        """Stellt die Kriterien-Scores (1-10) mehrerer Kandidaten nebeneinander,
        plus Gesamt-Score und Empfehlung. Erwartet mindestens zwei Namen."""
        vergleich, nicht_gefunden = [], []
        for name in kandidaten:
            eintrag = _finde(name)
            if eintrag is None:
                nicht_gefunden.append(name)
                continue
            zeile = _kurz(eintrag)
            if eintrag["bewertung"]:
                zeile["kriterien"] = {
                    ks["kriterium"]: ks["score"]
                    for ks in eintrag["bewertung"]["kriterien"]
                }
            vergleich.append(zeile)
        ergebnis: dict = {"vergleich": vergleich}
        if nicht_gefunden:
            ergebnis["nicht_gefunden"] = nicht_gefunden
            ergebnis["vorhandene_kandidaten"] = sorted(
                {e["kandidat"] for e in storage.lade_ergebnisse()}
            )
        return ergebnis

    @tool
    def statistik() -> dict:
        """Zaehlt Bewerbungen nach Status, K.O.- und Ablehnungsgruenden und
        berechnet den Durchschnitts-Score der inhaltlich Bewerteten."""
        eintraege = storage.lade_ergebnisse()
        scores = [e["gesamt_score"] for e in eintraege if e["gesamt_score"] is not None]
        ko_gruende: dict[str, int] = {}
        ablehnungsgruende: dict[str, int] = {}
        for e in eintraege:
            if e["ko_grund"]:
                text = ko_texte.get(e["ko_grund"], e["ko_grund"])
                ko_gruende[text] = ko_gruende.get(text, 0) + 1
            if e["bewertung"]:
                for g in e["bewertung"]["ablehnungsgruende"]:
                    text = grund_texte.get(g, g)
                    ablehnungsgruende[text] = ablehnungsgruende.get(text, 0) + 1
        return {
            "anzahl_gesamt": len(eintraege),
            "genehmigt": sum(1 for e in eintraege if e["status"] == "genehmigt"),
            "abgelehnt": sum(1 for e in eintraege if e["status"] == "abgelehnt"),
            "davon_ko": sum(1 for e in eintraege if e["ko_grund"]),
            "durchschnitts_score": round(sum(scores) / len(scores), 1) if scores else None,
            "ko_gruende": ko_gruende,
            "ablehnungsgruende": ablehnungsgruende,
        }

    @tool
    def lese_stellenausschreibung() -> str:
        """Liest die Stellenausschreibung, gegen die bewertet wird
        (Anforderungen, Aufgaben, Rahmenbedingungen)."""
        if stelle_text.strip():
            return stelle_text
        if STELLE_PFAD.exists():
            return STELLE_PFAD.read_text(encoding="utf-8")
        return "(keine Stellenausschreibung hinterlegt)"

    return [
        liste_bewerbungen,
        hole_bewertung,
        vergleiche_kandidaten,
        statistik,
        lese_stellenausschreibung,
    ]


def _als_text(nachricht: BaseMessage) -> str:
    """Message-Content robust zu Text machen (Gemini liefert auch Part-Listen)."""
    inhalt = nachricht.content
    if isinstance(inhalt, list):
        inhalt = "".join(
            teil.get("text", "") if isinstance(teil, dict) else str(teil)
            for teil in inhalt
        )
    return (inhalt or "").strip() or "(keine Antwort)"


def beantworte_frage(
    frage: str,
    verlauf: list[dict] | None = None,
    stelle: str = "",
    sprache: str = "de",
    llm=None,
) -> dict:
    """Beantwortet eine freie Nutzerfrage per Agent-Loop.

    verlauf: bisherige Chat-Nachrichten [{"rolle": "nutzer"|"assistent", "text": str}]
    sprache: "de"/"en" - Antwortsprache (folgt der UI-Sprache)
    Rueckgabe: {"antwort": str, "tool_aufrufe": [{"tool": str, "args": dict}]}
    - tool_aufrufe macht die Agent-Schritte im UI sichtbar.
    """
    llm = llm or get_llm()
    werkzeuge = build_werkzeuge(stelle, sprache)
    nach_name = {w.name: w for w in werkzeuge}
    llm_mit_werkzeugen = llm.bind_tools(werkzeuge).with_retry(stop_after_attempt=3)

    system_prompt = SYSTEM_PROMPT.format(
        antwort_regel=_ANTWORT_REGELN.get(sprache, _ANTWORT_REGELN["de"])
    )
    nachrichten: list[BaseMessage] = [SystemMessage(system_prompt)]
    for eintrag in (verlauf or [])[-MAX_VERLAUF:]:
        klasse = HumanMessage if eintrag.get("rolle") == "nutzer" else AIMessage
        nachrichten.append(klasse(str(eintrag.get("text", ""))[:MAX_ZEICHEN]))
    nachrichten.append(HumanMessage(frage[:MAX_ZEICHEN]))

    tool_aufrufe: list[dict] = []
    for _ in range(MAX_RUNDEN):
        antwort = llm_mit_werkzeugen.invoke(nachrichten)
        nachrichten.append(antwort)
        if not getattr(antwort, "tool_calls", None):
            return {"antwort": _als_text(antwort), "tool_aufrufe": tool_aufrufe}
        for aufruf in antwort.tool_calls:
            werkzeug = nach_name.get(aufruf["name"])
            try:
                ergebnis = (
                    werkzeug.invoke(aufruf["args"])
                    if werkzeug
                    else f"Unbekanntes Werkzeug: {aufruf['name']}"
                )
            except Exception as e:  # zurueck ans LLM statt Abbruch
                ergebnis = f"Werkzeug-Fehler: {e}"
            tool_aufrufe.append({"tool": aufruf["name"], "args": aufruf["args"]})
            nachrichten.append(
                ToolMessage(
                    content=json.dumps(ergebnis, ensure_ascii=False, default=str),
                    tool_call_id=aufruf.get("id") or aufruf["name"],
                )
            )

    # Runden-Limit erreicht: Antwort aus dem Gesammelten erzwingen
    nachrichten.append(
        HumanMessage(
            "Beantworte die Frage jetzt abschliessend mit den bereits "
            "gesammelten Informationen, ohne weitere Werkzeuge."
        )
    )
    antwort = llm.with_retry(stop_after_attempt=3).invoke(nachrichten)
    return {"antwort": _als_text(antwort), "tool_aufrufe": tool_aufrufe}
