"""Posteingang: sortiert Bulk-Uploads automatisch in Bewerbungen.

Ein hochgeladenes PDF kann EIN Dokument sein oder mehrere aneinander-
gehaengte (z.B. zweiseitiger Lebenslauf + Motivationsschreiben in einer
Datei). Pro PDF bestimmt ein LLM-Aufruf die Segmente (Seitenbereiche),
deren Dokumenttyp und den Bewerbernamen; pypdf teilt das PDF anschliessend
physisch auf. Die Gruppierung in Bewerbungen laeuft ueber den erkannten
Namen (API-Schicht).
"""

import io
from pathlib import Path

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import Runnable
from pypdf import PdfReader, PdfWriter

from core.schemas import DOKUMENT_LABELS, PdfAufteilung

MAX_SEITEN = 30
MAX_ZEICHEN_PRO_SEITE = 400

AUFTEILUNGS_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        """Du bist der Posteingang eines Bewerbungs-Screening-Systems. Du
erhaeltst ein PDF als nummerierte Seiten-Auszuege. Das PDF kann EIN
Dokument sein oder mehrere aneinandergehaengte Bewerbungsdokumente.

Aufgaben:
1. Teile das PDF in zusammenhaengende Segmente (Seitenbereiche) - je
   Segment genau ein Dokument: lebenslauf, motivationsschreiben oder
   sonstiges (Zeugnisse, Zertifikate, Notenspiegel, ...).
2. Erkenne den vollstaendigen Namen der Bewerberin/des Bewerbers (meist im
   Kopf des Lebenslaufs oder unter der Grussformel des Anschreibens).
   Nicht erkennbar -> null.

Regeln:
- Die Segmente muessen alle Seiten von 1 bis {anzahl_seiten} lueckenlos
  und ueberlappungsfrei abdecken, in aufsteigender Reihenfolge.
- Eine Fortsetzungsseite (z.B. "Seite 2/2" eines Lebenslaufs) gehoert zum
  selben Segment wie ihr Beginn.
- Im Zweifel ist eine Seite die Fortsetzung des vorherigen Segments.""",
    ),
    (
        "human",
        "Dateiname: {datei_name}\nSeitenzahl: {anzahl_seiten}\n\n{seiten_auszuege}",
    ),
])


def build_aufteilungs_chain(llm) -> Runnable:
    return (
        AUFTEILUNGS_PROMPT | llm.with_structured_output(PdfAufteilung)
    ).with_retry(stop_after_attempt=3)


def sortiere_pdf(datei_name: str, inhalt: bytes, chain: Runnable) -> dict:
    """Zerlegt ein hochgeladenes PDF in einzelne Dokumente.

    Rueckgabe: {"kandidat": str|None,
                "dokumente": [{"name", "inhalt" (bytes), "typ"}]}
    """
    reader = PdfReader(io.BytesIO(inhalt))
    auszuege = "\n\n".join(
        f"--- Seite {i + 1} ---\n"
        + (seite.extract_text() or "(kein Text)")[:MAX_ZEICHEN_PRO_SEITE].strip()
        for i, seite in enumerate(reader.pages[:MAX_SEITEN])
    )

    aufteilung = chain.invoke({
        "datei_name": datei_name,
        "anzahl_seiten": len(reader.pages),
        "seiten_auszuege": auszuege,
    })
    if aufteilung is None or not aufteilung.segmente:
        raise ValueError(f"{datei_name}: Aufteilung fehlgeschlagen.")

    # Genau ein Segment -> Original unveraendert uebernehmen (kein Re-Write)
    if len(aufteilung.segmente) == 1:
        return {
            "kandidat": aufteilung.kandidat,
            "dokumente": [{
                "name": datei_name,
                "inhalt": inhalt,
                "typ": aufteilung.segmente[0].typ,
            }],
        }

    stem = Path(datei_name).stem
    dokumente = []
    for segment in aufteilung.segmente:
        start = max(1, segment.start_seite)
        ende = min(len(reader.pages), max(start, segment.end_seite))
        writer = PdfWriter()
        for i in range(start - 1, ende):
            writer.add_page(reader.pages[i])
        puffer = io.BytesIO()
        writer.write(puffer)

        seiten_info = f"S. {start}" if start == ende else f"S. {start}-{ende}"
        label = DOKUMENT_LABELS[segment.typ]
        dokumente.append({
            "name": f"{stem} - {label} ({seiten_info}).pdf",
            "inhalt": puffer.getvalue(),
            "typ": segment.typ,
        })
    return {"kandidat": aufteilung.kandidat, "dokumente": dokumente}
