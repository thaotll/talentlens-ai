"""Die Screening-Pipeline als LCEL-Kette (pures LangChain, kein LangGraph).

Eine *Bewerbung* besteht aus mehreren PDF-Dateien (z.B. zweiteiliger
Lebenslauf + Motivationsschreiben). Ablauf:

    Dateien -> Extraktion + Klassifikation -> K.O.-Pruefung
            -> [K.O.?]  ja:  direkte Ablehnung ohne LLM-Bewertung
                        nein: Anonymisierung -> Bewertung -> Selbstkritik -> Score

Die Verzweigung ist ein RunnableBranch; der Zustand fliesst als dict durch
die Kette.

    Input:  {"dateien": [{"name": str, "pfad": str}], "stelle": str,
             "kandidat": str, "ko_kriterien": {"lebenslauf_erforderlich": bool,
                                               "motivationsschreiben_erforderlich": bool}}
    Output: + dokumente, status ("genehmigt"|"abgelehnt"), ko_grund (KOGrund|None),
              bewertung (Bewertung|None), gesamt_score, empfehlung,
              korrigiert, kritik_maengel
"""

from langchain_core.runnables import (
    Runnable,
    RunnableBranch,
    RunnableLambda,
    RunnablePassthrough,
)

from core.anonymization import build_anonymisierungs_chain
from core.evaluation import build_bewertungs_chain, build_kritik_chain
from core.extraction import extrahiere_pdf_text
from core.klassifikation import build_klassifikations_chain
from core.llm import get_llm
from core.ranking import berechne_gesamtscore, leite_empfehlung_ab
from core.schemas import DokumentTyp, KOGrund

KEIN_MOTIVATIONSSCHREIBEN = "(nicht eingereicht)"

KORREKTUR_HINWEIS = (
    "\n\nKorrekturhinweise aus der Qualitaetspruefung (unbedingt beruecksichtigen):\n- {}"
)


def build_screening_pipeline(llm=None) -> Runnable:
    llm = llm or get_llm()
    klassifikations_chain = build_klassifikations_chain(llm)
    anonymisierungs_chain = build_anonymisierungs_chain(llm)
    bewertungs_chain = build_bewertungs_chain(llm)
    kritik_chain = build_kritik_chain(llm)

    # --- Schritt 1: jede Datei extrahieren und klassifizieren -------------
    def _extrahieren_und_klassifizieren(state: dict) -> dict:
        dokumente = []
        for datei in state["dateien"]:
            text = extrahiere_pdf_text(datei["pfad"])
            klassifikation = klassifikations_chain.invoke(
                {"datei_name": datei["name"], "auszug": text[:1500]}
            )
            dokumente.append(
                {"name": datei["name"], "typ": klassifikation.typ, "text": text}
            )
        return {**state, "dokumente": dokumente}

    # --- Schritt 2: K.O.-Kriterien pruefen (ohne LLM) ----------------------
    def _ko_pruefung(state: dict) -> dict:
        ko = state.get("ko_kriterien", {})
        typen = {d["typ"] for d in state["dokumente"]}
        ko_grund = None
        if ko.get("lebenslauf_erforderlich", True) and DokumentTyp.LEBENSLAUF not in typen:
            ko_grund = KOGrund.LEBENSLAUF_FEHLT
        elif (
            ko.get("motivationsschreiben_erforderlich", False)
            and DokumentTyp.MOTIVATIONSSCHREIBEN not in typen
        ):
            ko_grund = KOGrund.MOTIVATIONSSCHREIBEN_FEHLT
        return {**state, "ko_grund": ko_grund}

    # --- Zweig A: K.O. -> direkte Ablehnung ohne Bewertung -----------------
    def _ko_ergebnis(state: dict) -> dict:
        return {
            **state,
            "status": "abgelehnt",
            "bewertung": None,
            "gesamt_score": None,
            "empfehlung": None,
            "korrigiert": False,
            "kritik_maengel": [],
        }

    # --- Zweig B: volle LLM-Bewertung --------------------------------------
    def _texte_zusammenfuehren(state: dict) -> dict:
        """Mehrteilige Lebenslaeufe zusammenfuehren, Motivationsschreiben separat."""
        cv_teile = [
            d["text"] for d in state["dokumente"] if d["typ"] == DokumentTyp.LEBENSLAUF
        ]
        # Ist kein Dokument als Lebenslauf klassifiziert (und der K.O.-Haken
        # aus), bewerten wir notgedrungen alle Nicht-Motivationsschreiben.
        if not cv_teile:
            cv_teile = [
                d["text"] for d in state["dokumente"]
                if d["typ"] != DokumentTyp.MOTIVATIONSSCHREIBEN
            ]
        motivation_teile = [
            d["text"] for d in state["dokumente"]
            if d["typ"] == DokumentTyp.MOTIVATIONSSCHREIBEN
        ]
        return {
            **state,
            "cv_text": "\n\n".join(cv_teile),
            "motivation_text": "\n\n".join(motivation_teile) or None,
        }

    def _anonymisieren(state: dict) -> dict:
        cv_anonym = anonymisierungs_chain.invoke({"cv_text": state["cv_text"]})
        motivation_anonym = (
            anonymisierungs_chain.invoke({"cv_text": state["motivation_text"]})
            if state["motivation_text"]
            else KEIN_MOTIVATIONSSCHREIBEN
        )
        return {**state, "cv_text": cv_anonym, "motivation_text": motivation_anonym}

    def _bewerten(state: dict):
        bewertung = bewertungs_chain.invoke({
            "cv_text": state["cv_text"],
            "motivation_text": state["motivation_text"],
            "stelle": state["stelle"],
            "hinweis": "",
        })
        if bewertung is None:
            raise ValueError("LLM hat keine strukturierte Bewertung geliefert.")
        return bewertung

    def _pruefe_und_korrigiere(state: dict) -> dict:
        """Selbstkritik: ist die Bewertung durch die Unterlagen gedeckt?
        Wenn nicht, wird die Bewertung genau einmal mit den Beanstandungen
        als Hinweis wiederholt (bewusst begrenzt, keine Endlosschleife)."""
        urteil = kritik_chain.invoke({
            "cv_text": state["cv_text"],
            "motivation_text": state["motivation_text"],
            "bewertung_json": state["bewertung"].model_dump_json(indent=2),
        })
        state = {**state, "korrigiert": False, "kritik_maengel": list(urteil.maengel)}
        if urteil.belegt:
            return state

        neue_bewertung = bewertungs_chain.invoke({
            "cv_text": state["cv_text"],
            "motivation_text": state["motivation_text"],
            "stelle": state["stelle"],
            "hinweis": KORREKTUR_HINWEIS.format("\n- ".join(urteil.maengel)),
        })
        return {**state, "bewertung": neue_bewertung, "korrigiert": True}

    def _aggregieren(state: dict) -> dict:
        gesamt_score = berechne_gesamtscore(state["bewertung"])
        empfehlung = leite_empfehlung_ab(gesamt_score)
        return {
            **state,
            "gesamt_score": gesamt_score,
            "empfehlung": empfehlung,
            # "genehmigt" = hat das Screening ueberstanden (Einladen/Pruefen)
            "status": "abgelehnt" if empfehlung == "Ablehnen" else "genehmigt",
        }

    bewertungs_zweig = (
        RunnableLambda(_texte_zusammenfuehren)
        | RunnableLambda(_anonymisieren)
        | RunnablePassthrough.assign(bewertung=RunnableLambda(_bewerten))
        | RunnableLambda(_pruefe_und_korrigiere)
        | RunnableLambda(_aggregieren)
    )

    return (
        RunnableLambda(_extrahieren_und_klassifizieren)
        | RunnableLambda(_ko_pruefung)
        | RunnableBranch(
            (lambda state: state["ko_grund"] is not None, RunnableLambda(_ko_ergebnis)),
            bewertungs_zweig,
        )
    )


def screene_bewerbung(
    dateien: list[dict],
    stelle: str,
    kandidat: str,
    ko_kriterien: dict | None = None,
    pipeline: Runnable | None = None,
) -> dict:
    """Komfort-Funktion: eine Bewerbung (mehrere Dateien) durch die Pipeline schicken.

    dateien: [{"name": "cv.pdf", "pfad": "/tmp/..."}, ...]
    """
    pipeline = pipeline or build_screening_pipeline()
    return pipeline.invoke({
        "dateien": dateien,
        "stelle": stelle,
        "kandidat": kandidat,
        "ko_kriterien": ko_kriterien or {},
    })
