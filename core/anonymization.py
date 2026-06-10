"""Anonymisierung: entfernt personenbezogene Merkmale vor der Bewertung.

Bias-Mitigation: Das bewertende LLM sieht weder Name noch Geschlecht, Alter
oder Herkunft. HR sieht im Dashboard weiterhin den Dateinamen - anonymisiert
wird nur, was in die Bewertung einfliesst.
"""

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import Runnable

ANONYMISIERUNGS_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        """Du anonymisierst Lebenslaeufe fuer ein faires Bewerbungs-Screening.

Ersetze die folgenden Angaben durch "[ENTFERNT]":
- Vor- und Nachnamen (auch in E-Mail-Adressen oder Profil-URLs)
- Anrede und Geschlecht, Geburtsdatum und Alter
- Nationalitaet, Familienstand, Hinweise auf Fotos
- Adresse, Telefonnummer, E-Mail-Adresse, Social-Media-Profile

Alles Fachliche bleibt UNVERAENDERT erhalten: berufliche Stationen,
Zeitraeume, Skills, Abschluesse, Noten, Sprachen, Projekte.

Gib NUR den anonymisierten Lebenslauf zurueck, ohne Kommentar.""",
    ),
    ("human", "{cv_text}"),
])


def build_anonymisierungs_chain(llm) -> Runnable:
    return ANONYMISIERUNGS_PROMPT | llm | StrOutputParser()
