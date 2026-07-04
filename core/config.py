"""Zentrale Konfiguration: Modell, Kriterien-Gewichtung und Pfade."""

import os
from pathlib import Path

from dotenv import load_dotenv

PROJEKT_ROOT = Path(__file__).resolve().parents[1]

# .env schon hier laden (config ist das unterste Modul), damit auch
# Pfad-Variablen wie TALENTLENS_DATEN aus der .env greifen.
load_dotenv(PROJEKT_ROOT / ".env", override=True)

# Beschreibbares Datenverzeichnis (SQLite + Upload-PDFs). Beim Hosting auf
# ein persistentes Volume zeigen lassen (z.B. TALENTLENS_DATEN=/data auf
# Railway), sonst sind Verlauf und Entwuerfe nach jedem Deploy weg.
DATEN_PFAD = Path(os.getenv("TALENTLENS_DATEN") or PROJEKT_ROOT / "data")
DB_PFAD = DATEN_PFAD / "ergebnisse.db"
UPLOADS_PFAD = DATEN_PFAD / "uploads"

# Liegt bewusst im Repo (nicht im Volume): die mitgelieferte Beispiel-Stelle.
STELLE_PFAD = PROJEKT_ROOT / "data" / "stellenausschreibung.md"

# https://aistudio.google.com/apikey
MODELL_NAME = "gemini-2.5-flash"

# Gewichtung der Bewertungskriterien fuer den Gesamt-Score (Summe = 1.0).
# Der Gesamt-Score wird deterministisch in Python berechnet, NICHT vom LLM.
KRITERIEN_GEWICHTE = {
    "berufserfahrung": 0.35,
    "skills": 0.35,
    "ausbildung": 0.20,
    "sprachkenntnisse": 0.10,
}

# Schwellen fuer die Empfehlung (Gesamt-Score auf Skala 10-100)
SCHWELLE_EINLADEN = 75.0
SCHWELLE_PRUEFEN = 50.0
