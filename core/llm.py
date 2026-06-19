"""LLM-Factory: Gemini mit temperature=0 (bezahlter API-Key, kein Rate-Limit)."""

import os

from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI

from core.config import MODELL_NAME, PROJEKT_ROOT

# .env explizit aus dem Projekt-Root laden - unabhaengig davon, aus welchem
# Verzeichnis uvicorn gestartet wird. (load_dotenv() ohne Pfad sucht nur ab
# dem aktuellen Arbeitsverzeichnis und findet die Datei dann evtl. nicht.)
load_dotenv(PROJEKT_ROOT / ".env")


def api_key_vorhanden() -> bool:
    return bool(os.getenv("GOOGLE_API_KEY", "").strip())


def get_llm() -> ChatGoogleGenerativeAI:
    if not api_key_vorhanden():
        raise RuntimeError(
            "GOOGLE_API_KEY fehlt. Lege im Projekt-Root eine .env-Datei an "
            "(Vorlage: .env.example) und trage den Key von "
            "https://aistudio.google.com/apikey ein. Die .env ist bewusst "
            "nicht im Git - nach dem Klonen muss sie also neu erstellt werden."
        )
    return ChatGoogleGenerativeAI(
        model=MODELL_NAME,
        temperature=0,  # reproduzierbare Bewertungen
    )
