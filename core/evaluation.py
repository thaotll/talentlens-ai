"""Bewertungs- und Selbstkritik-Chains (LCEL + Structured Output).

- Bewertung: pro Kriterium ein Score mit fester Rubrik + woertlichen Belegen.
- Kritik: zweiter LLM-Aufruf prueft, ob die Bewertung durch das CV gedeckt ist
  (das "agentische" Element der Pipeline).
"""

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import Runnable

from core.schemas import Bewertung, KritikUrteil

# Ausgabesprache der Freitexte (Begruendungen, Staerken, Zusammenfassung),
# gesteuert ueber die UI-Sprache. Die Belege bleiben in beiden Faellen
# woertliche Zitate in der Originalsprache der Unterlagen - sonst findet die
# Selbstkritik sie im CV nicht wieder.
SPRACHE_ANWEISUNGEN = {
    "de": "\n- Schreibe Begruendungen, Staerken und Zusammenfassung auf Deutsch.",
    "en": "\n- Write all justifications, strengths and the summary in English. "
    "Keep the belege as verbatim quotes in the original language of the documents.",
}

BEWERTUNGS_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        """Du bist ein erfahrener HR-Assistent. Bewerte den Lebenslauf strikt anhand
der Stellenausschreibung - nach genau diesen vier Kriterien:

- berufserfahrung: Relevanz und Dauer bisheriger Taetigkeiten fuer DIESE Stelle
- skills: Abdeckung der geforderten fachlichen Kompetenzen und Tools
- ausbildung: Passung von Abschluss und Fachrichtung zu den Anforderungen
- sprachkenntnisse: Abdeckung der geforderten Sprachen auf dem geforderten Niveau

Score-Rubrik (konsequent anwenden, KEINE Gefaelligkeits-Scores):
1-2:  keine Anzeichen, dass das Kriterium erfuellt ist
3-4:  deutliche Luecken gegenueber den Anforderungen
5-6:  Grundanforderungen teilweise erfuellt
7-8:  Anforderungen weitgehend erfuellt
9-10: Anforderungen voll erfuellt oder uebertroffen

Regeln:
- Jeder Score MUSS durch woertliche Zitate aus den Unterlagen belegt sein.
  Was nicht in den Unterlagen steht, existiert nicht - nichts dazuerfinden.
- Das Motivationsschreiben (falls vorhanden) ist Kontext: Es kann Luecken
  erklaeren und die Passung schaerfen, ersetzt aber keine fehlende
  Qualifikation im Lebenslauf.
- Bewerte ausschliesslich die fachliche Passung. Die Unterlagen sind
  anonymisiert; "[ENTFERNT]"-Stellen ignorierst du vollstaendig.
- ablehnungsgruende: nur Kategorien angeben, die klar zutreffen.
  Bei einem rundum passenden Kandidaten: leere Liste.{sprache_anweisung}{hinweis}""",
    ),
    (
        "human",
        "## Stellenausschreibung\n{stelle}\n\n## Lebenslauf (anonymisiert)\n{cv_text}"
        "\n\n## Motivationsschreiben (anonymisiert)\n{motivation_text}",
    ),
])

KRITIK_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        """Du bist ein strenger Qualitaetspruefer fuer KI-generierte CV-Bewertungen.
Pruefe die Bewertung gegen den Lebenslauf:

1. Findet sich jedes angegebene Zitat sinngemaess im Lebenslauf wieder?
2. Ist die Hoehe jedes Scores durch Begruendung und Belege gedeckt?
3. Sind die Ablehnungsgruende durch den Lebenslauf gedeckt?

Beanstande nur echte Fehler (erfundene Belege, unplausible Scores),
keine Stilfragen.""",
    ),
    (
        "human",
        "## Lebenslauf\n{cv_text}\n\n## Motivationsschreiben\n{motivation_text}"
        "\n\n## Zu pruefende Bewertung (JSON)\n{bewertung_json}",
    ),
])


def build_bewertungs_chain(llm) -> Runnable:
    return (
        BEWERTUNGS_PROMPT | llm.with_structured_output(Bewertung)
    ).with_retry(stop_after_attempt=3)


def build_kritik_chain(llm) -> Runnable:
    return (
        KRITIK_PROMPT | llm.with_structured_output(KritikUrteil)
    ).with_retry(stop_after_attempt=3)
