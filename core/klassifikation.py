"""Dokument-Klassifikation: Welcher Dokumenttyp ist eine hochgeladene PDF?

Grundlage fuer die K.O.-Pruefung ("Motivationsschreiben fehlt -> direkt raus")
und fuer das Zusammenfuehren mehrteiliger Lebenslaeufe.
"""

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import Runnable

from core.schemas import DokumentKlassifikation

KLASSIFIKATIONS_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        """Du klassifizierst Bewerbungsdokumente. Entscheide anhand von
Dateiname und Textauszug, um welchen Dokumenttyp es sich handelt:

- lebenslauf: CV bzw. tabellarischer Werdegang (Stationen, Skills,
  Ausbildung) - auch wenn es nur ein Teil eines mehrseitigen CVs ist
- motivationsschreiben: Anschreiben bzw. Motivationsschreiben
  (Fliesstext, Anrede wie "Sehr geehrte...", Begruendung der Bewerbung)
- sonstiges: alles andere (Arbeitszeugnisse, Zertifikate, Notenspiegel, ...)""",
    ),
    ("human", "Dateiname: {datei_name}\n\nTextauszug:\n{auszug}"),
])


def build_klassifikations_chain(llm) -> Runnable:
    return (
        KLASSIFIKATIONS_PROMPT | llm.with_structured_output(DokumentKlassifikation)
    ).with_retry(stop_after_attempt=3)
