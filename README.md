# TalentLens AI

Agentisches CV-Screening mit **LangChain**: Bewerbungen werden per
Bulk-Upload eingeworfen — der *Posteingang* erkennt pro PDF automatisch,
welche Dokumente darin stecken (auch Sammel-PDFs: 2 Seiten Lebenslauf +
1 Seite Motivationsschreiben in einer Datei), teilt sie auf und ordnet sie
ueber den erkannten Bewerbernamen der richtigen Bewerbung zu. Danach wird
gegen die Stellenausschreibung bewertet, nach Score sortiert und im
Next.js-Dashboard mit Genehmigt- und Verlaufs-Ansicht dargestellt.
K.O.-Kriterien (z.B. fehlendes Motivationsschreiben) lehnen Bewerbungen
direkt ab — ohne LLM-Bewertung.

> Uni-Projekt. **Keine echten Bewerbungen verarbeiten** — siehe
> [Limitationen](#limitationen).

## Architektur

```
Next.js-Dashboard (web/, Port 3000)
        |  /api/* wird per Rewrite an FastAPI weitergereicht
        v
FastAPI (api/, Port 8000)
        |
        v
LangChain LCEL-Pipeline:

  Bulk-Upload (1..n gemischte PDFs)
     |
     v
  [Posteingang]                   core/eingang.py: ein LLM-Aufruf pro PDF
     |                            erkennt Segmente (Seitenbereiche), Typ und
     |                            Bewerbernamen; pypdf teilt physisch auf;
     |                            Gruppierung nach erkanntem Namen
     v
  Bewerbung (1..n Dokumente)      core/pipeline.py:
     |
     v
  [Extraktion + Klassifikation]   PyPDFLoader -> Text; LLM klassifiziert
     |                            jede Datei (Lebenslauf / Motivations-
     |                            schreiben / Sonstiges)
     v
  [K.O.-Pruefung]                 Pflichtdokument fehlt? -> RunnableBranch:
     |                            direkte Ablehnung OHNE LLM-Bewertung
     v
  [Zusammenfuehren]               mehrteilige Lebenslaeufe mergen
     v
  [Anonymisierung]                Name/Geschlecht/Alter/Kontakt entfernt
     v
  [Bewertung]                     LLM bewertet pro Kriterium mit fester
     |                            Rubrik, Structured Output via Pydantic
     v
  [Selbstkritik]                  zweiter LLM-Aufruf prueft Belege;
     |                            bei Beanstandung 1x Korrektur
     v
  [Aggregation]                   Gesamt-Score deterministisch in Python
     |                            (gewichtete Summe, KEIN LLM)
     v
  [SQLite]                        Persistenz fuer Genehmigt-Tab + Verlauf
```

### Design-Entscheidungen

- **Gesamt-Score nicht vom LLM:** LLM-Gesamtscores sind schlecht kalibriert
  (clustern um 7–8, schwanken zwischen Laeufen). Das LLM bewertet nur die
  vier Einzelkriterien mit einer festen Rubrik; der Gesamt-Score ist eine
  gewichtete Summe in Python (`core/config.py` → `KRITERIEN_GEWICHTE`).
- **K.O.-Kriterien vor der Bewertung:** Per Haekchen im Dashboard
  konfigurierbar. Die Pipeline klassifiziert jede Datei und lehnt
  Bewerbungen ohne Pflichtdokument direkt ab (`RunnableBranch`) — spart
  LLM-Kosten und macht die Regel transparent.
- **Ablehnungsgruende als Enum:** Statt Freitext liefert das LLM Kategorien
  (`core/schemas.py` → `AblehnungsGrund`) — im Verlauf sieht man sofort,
  *warum* jemand rausgeflogen ist.
- **Anonymisierung vor der Bewertung:** Das bewertende LLM sieht weder Name
  noch Geschlecht, Alter oder Herkunft (Bias-Mitigation). HR sieht im
  Dashboard weiterhin den Kandidatennamen.
- **Selbstkritik als agentisches Element:** Ein zweiter LLM-Aufruf prueft,
  ob jede Bewertung durch woertliche Zitate gedeckt ist; bei Beanstandung
  wird genau einmal korrigiert.
- **temperature=0:** reproduzierbare Bewertungen.

## Setup

**Backend:**

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# API-Key: https://aistudio.google.com/apikey
cp .env.example .env   # und GOOGLE_API_KEY eintragen

# Fiktive Test-Bewerbungen erzeugen (5 Kandidaten-Ordner)
python scripts/generate_test_cvs.py
```

> Hinweis: Ohne aktiviertes Billing laeuft der Key im Free Tier
> (sehr niedriges Tageslimit fuer gemini-2.5-flash). Fuer fluessiges
> Arbeiten Billing im Google-Cloud-Projekt aktivieren.

**Frontend:**

```bash
cd web && npm install
```

## Starten

Zwei Terminals:

```bash
# 1) LangChain-API
.venv/bin/uvicorn api.main:app --reload --port 8000

# 2) Dashboard
cd web && npm run dev
```

Dann http://localhost:3000 oeffnen:

- **Screening:** Bewerbungs-Karten anlegen, pro Kandidat eine oder mehrere
  PDFs hineinziehen, K.O.-Kriterien anhaken, analysieren.
- **Genehmigt:** Nur die Kandidaten, die das Screening ueberstanden haben —
  sortiert nach Score, mit aufklappbarer Begruendung und Zitaten.
- **Verlauf:** Alle Bewertungen, auch abgelehnte — inkl. K.O.- und
  Ablehnungsgruenden.

**CLI (ohne Frontend, ein Ordner = eine Bewerbung):**

```bash
python scripts/screen_cli.py data/test_cvs/* --ko-motivationsschreiben
```

## Test-Daten

`data/stellenausschreibung.md` (Junior Data Analyst) plus 5 fiktive
Bewerbungs-Ordner unter `data/test_cvs/`:

| Ordner | Profil | Demo-Zweck |
|---|---|---|
| `anna_schmidt/` | Statistik-M.Sc., 2 J. Analytics (CV + Anschreiben) | sollte weit oben landen |
| `ben_keller/` | BWL, Excel gut — **nur CV** | fliegt per K.O. raus, wenn "Motivationsschreiben erforderlich" aktiv |
| `clara_witt/` | Hotelfachfrau, fachfremd | unten / abgelehnt |
| `david_okafor/` | Starker Backend-Dev, **zweiteiliger CV** + Anschreiben | Klassifikation + Zusammenfuehren, fachlicher Streitfall |
| `eva_lang/` | Ordentlicher Fit, **zweispaltiges CV-Layout** | Stresstest Text-Extraktion |
| `bewerbung_felix_brandt_komplett.pdf` | **Sammel-PDF**: 2 S. CV + 1 S. Anschreiben in einer Datei | Demo fuer den Bulk-Upload |

## Projektstruktur

```
core/        LangChain: Pipeline, Chains, Schemas, Ranking, Persistenz
api/         FastAPI-Schicht um die Pipeline
web/         Next.js-Dashboard (Screening / Genehmigt / Verlauf)
data/        Stellenausschreibung, Test-Bewerbungen, SQLite-DB (gitignored)
scripts/     Test-Daten-Generator, CLI
```

## Limitationen

- **Kein Ersatz fuer HR-Entscheidungen.** Das System priorisiert nur; die
  Entscheidung trifft ein Mensch. Der **EU AI Act stuft KI-gestuetztes
  Bewerber-Screening als Hochrisiko-System ein** (Anhang III) — ein
  Produktiveinsatz haette erhebliche Auflagen (Transparenz, menschliche
  Aufsicht, Dokumentation).
- **Datenschutz:** Im Gemini **Free Tier darf Google Eingaben fuer das
  Training verwenden**. Deshalb ausschliesslich fiktive Test-CVs verwenden —
  niemals echte Bewerberdaten (DSGVO!).
- **Bias:** Die Anonymisierung reduziert offensichtliche Merkmale, kann aber
  indirekte Proxys (Vereinsnamen, Stadtteile, Bildungswege) nicht
  vollstaendig neutralisieren. LLMs koennen trainingsbedingte Verzerrungen
  reproduzieren.
- **K.O. haengt an der Klassifikation:** Erkennt das LLM ein
  Motivationsschreiben faelschlich als "Sonstiges", greift das K.O. zu
  Unrecht. Die Klassifikation ist deshalb im Verlauf pro Datei einsehbar.
- **PDF-Grenzen:** Gescannte PDFs (Bilder) werden nicht unterstuetzt (kein
  OCR). Exotische Layouts koennen die Extraktion verschlechtern —
  `eva_lang/` demonstriert den Fall.
- **Kalibrierung:** Auch mit Rubrik und temperature=0 bleiben LLM-Scores
  eine Schaetzung; kleine Score-Unterschiede (±5) sind nicht signifikant.
