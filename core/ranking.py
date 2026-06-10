"""Deterministisches Ranking: Gesamt-Score und Empfehlung werden in Python
berechnet, nicht vom LLM - das macht die Reihenfolge reproduzierbar und die
Gewichtung transparent.
"""

from core.config import KRITERIEN_GEWICHTE, SCHWELLE_EINLADEN, SCHWELLE_PRUEFEN
from core.schemas import Bewertung


def berechne_gesamtscore(bewertung: Bewertung) -> float:
    """Gewichtete Summe der Kriterien-Scores, skaliert auf 10-100."""
    scores = {ks.kriterium.value: ks.score for ks in bewertung.kriterien}
    # Fehlt ein Kriterium im LLM-Output, zaehlt es konservativ als 1.
    gewichtet = sum(
        gewicht * scores.get(name, 1)
        for name, gewicht in KRITERIEN_GEWICHTE.items()
    )
    return round(gewichtet * 10, 1)


def leite_empfehlung_ab(gesamt_score: float) -> str:
    if gesamt_score >= SCHWELLE_EINLADEN:
        return "Einladen"
    if gesamt_score >= SCHWELLE_PRUEFEN:
        return "Pruefen"
    return "Ablehnen"


def sortiere_ergebnisse(ergebnisse: list[dict]) -> list[dict]:
    """Beste Kandidaten zuerst."""
    return sorted(ergebnisse, key=lambda e: e["gesamt_score"], reverse=True)
