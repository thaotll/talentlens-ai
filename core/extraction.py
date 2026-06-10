"""PDF -> Text: Extraktion mit PyPDFLoader + einfaches Text-Cleaning."""

import re

from langchain_community.document_loaders import PyPDFLoader


def extrahiere_pdf_text(pdf_pfad: str) -> str:
    """Laedt ein CV-PDF und gibt den bereinigten Volltext zurueck."""
    seiten = PyPDFLoader(str(pdf_pfad)).load()
    text = "\n".join(seite.page_content for seite in seiten)
    return bereinige_text(text)


def bereinige_text(text: str) -> str:
    text = text.replace("\x00", " ")
    text = re.sub(r"[ \t]+", " ", text)          # Mehrfach-Leerzeichen
    text = re.sub(r"\n{3,}", "\n\n", text)        # Leerzeilen-Stapel
    text = text.strip()

    if len(text) < 100:
        raise ValueError(
            f"Kaum Text extrahiert ({len(text)} Zeichen). Vermutlich ein "
            "gescanntes PDF - OCR wird nicht unterstuetzt (siehe README/Limitationen)."
        )
    return text
