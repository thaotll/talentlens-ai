"""CLI zum Testen der Pipeline ohne Frontend.

Ein Ordner = eine Bewerbung (alle PDFs darin gehoeren zusammen).

Beispiele:
    python scripts/screen_cli.py data/test_cvs/anna_schmidt
    python scripts/screen_cli.py data/test_cvs/*  --ko-motivationsschreiben
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core import storage
from core.config import STELLE_PFAD
from core.pipeline import build_screening_pipeline
from core.ranking import sortiere_ergebnisse
from core.schemas import GRUND_LABELS, KO_LABELS, KOGrund


def main():
    parser = argparse.ArgumentParser(description="CV-Screening per CLI")
    parser.add_argument("ordner", nargs="+", help="Bewerbungs-Ordner (je ein Kandidat)")
    parser.add_argument(
        "--stelle", default=str(STELLE_PFAD),
        help="Pfad zur Stellenausschreibung (Markdown/Text)",
    )
    parser.add_argument(
        "--ko-motivationsschreiben", action="store_true",
        help="K.O.: Bewerbungen ohne Motivationsschreiben direkt ablehnen",
    )
    args = parser.parse_args()

    stelle = Path(args.stelle).read_text(encoding="utf-8")
    pipeline = build_screening_pipeline()
    ko_kriterien = {
        "lebenslauf_erforderlich": True,
        "motivationsschreiben_erforderlich": args.ko_motivationsschreiben,
    }

    ergebnisse = []
    for ordner in args.ordner:
        ordner = Path(ordner)
        pdfs = sorted(ordner.glob("*.pdf"))
        if not pdfs:
            print(f"{ordner}: keine PDFs gefunden, uebersprungen.")
            continue
        kandidat = ordner.name.replace("_", " ").title()
        print(f"Bewerte {kandidat} ({len(pdfs)} Datei(en)) ...")
        try:
            ergebnis = pipeline.invoke({
                "dateien": [{"name": p.name, "pfad": str(p)} for p in pdfs],
                "stelle": stelle,
                "kandidat": kandidat,
                "ko_kriterien": ko_kriterien,
            })
            storage.speichere_ergebnis(ergebnis)
            ergebnisse.append(ergebnis)
        except Exception as e:
            print(f"  FEHLER: {e}")

    bewertete = [e for e in ergebnisse if e["gesamt_score"] is not None]
    kos = [e for e in ergebnisse if e["gesamt_score"] is None]

    print("\n=== Ranking (beste zuerst) ===")
    for rang, e in enumerate(sortiere_ergebnisse(bewertete), start=1):
        b = e["bewertung"]
        gruende = ", ".join(GRUND_LABELS[g] for g in b.ablehnungsgruende) or "-"
        korrigiert = " [von Selbstkritik korrigiert]" if e.get("korrigiert") else ""
        print(f"\n#{rang}  {e['kandidat']}  Score {e['gesamt_score']:.1f}  "
              f"-> {e['empfehlung']} ({e['status']}){korrigiert}")
        for ks in b.kriterien:
            print(f"    {ks.kriterium.value}: {ks.score}/10")
        print(f"    Dokumente: {', '.join(d['name'] + ' [' + d['typ'].value + ']' for d in e['dokumente'])}")
        print(f"    Schwachstellen: {gruende}")
        print(f"    {b.zusammenfassung}")

    if kos:
        print("\n=== Direkt abgelehnt (K.O.-Kriterium) ===")
        for e in kos:
            print(f"  {e['kandidat']}: {KO_LABELS[KOGrund(e['ko_grund'])]}")


if __name__ == "__main__":
    main()
