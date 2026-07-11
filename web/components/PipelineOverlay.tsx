"use client";

import { useEffect, useRef, useState } from "react";
import { LOCALES, useSprache, type Sprache } from "@/lib/i18n";
import type {
  LiveStand,
  PipelineSchritt,
  ScreeningErgebnis,
} from "@/lib/types";
import { formatScore, Spinner, StatusChip } from "./ui";

/** Detail-Ansicht der Pipeline als Popup: links das Flow-Chart von oben nach
 *  unten (mit Live-Status, Zeiten und Auto-Scroll zum aktiven Schritt),
 *  rechts die Erklaerung samt echtem Code-Ausschnitt. Waehrend einer Analyse
 *  folgt die rechte Seite automatisch dem laufenden Schritt; ein Klick auf
 *  einen Knoten pinnt ihn. Geoeffnet wird das Popup ueber die laufende
 *  Bewerbungskarte im Screening-Tab. */

interface Knoten {
  id: PipelineSchritt;
  llm?: boolean; // Schritt ruft Gemini auf
}

const HAUPT_KNOTEN: Knoten[] = [
  { id: "extraktion", llm: true },
  { id: "ko_pruefung" },
];

const KO_KNOTEN: Knoten = { id: "ko_ablehnung" };

const BEWERTUNGS_ZWEIG_KNOTEN: Knoten[] = [
  { id: "zusammenfuehren" },
  { id: "anonymisierung", llm: true },
  { id: "bewertung", llm: true },
  { id: "selbstkritik", llm: true },
  { id: "score" },
];

const KNOTEN_LABELS: Record<Sprache, Record<PipelineSchritt, string>> = {
  de: {
    extraktion: "Extraktion & Klassifikation",
    ko_pruefung: "K.O.-Prüfung",
    ko_ablehnung: "Direkte Ablehnung",
    zusammenfuehren: "Zusammenführen",
    anonymisierung: "Anonymisierung",
    bewertung: "Bewertung",
    selbstkritik: "Selbstkritik",
    score: "Score & Empfehlung",
  },
  en: {
    extraktion: "Extraction & classification",
    ko_pruefung: "Knock-out check",
    ko_ablehnung: "Direct rejection",
    zusammenfuehren: "Merge",
    anonymisierung: "Anonymization",
    bewertung: "Evaluation",
    selbstkritik: "Self-critique",
    score: "Score & recommendation",
  },
};

const T = {
  de: {
    dialogAria: "Pipeline-Ansicht",
    titel: "Screening-Pipeline",
    untertitel: "pures LangChain (LCEL) · Live-Events aus",
    schliessenAria: "Pipeline-Ansicht schließen",
    schliessen: "Schließen ✕",
    ko: "K.O.",
    bestanden: "bestanden ↓",
    liveFolgen: "● wieder live folgen",
    ganzeKette: "Gesamte Kette anzeigen",
    llmTitle: "Dieser Schritt ruft das LLM (Gemini) auf",
    korrigiert: "korrigiert",
    korrigiertTitle:
      "Die Selbstkritik hat Mängel gefunden - die Bewertung wurde einmal korrigiert wiederholt",
  },
  en: {
    dialogAria: "Pipeline view",
    titel: "Screening pipeline",
    untertitel: "pure LangChain (LCEL) · live events from",
    schliessenAria: "Close pipeline view",
    schliessen: "Close ✕",
    ko: "K.O.",
    bestanden: "passed ↓",
    liveFolgen: "● follow live again",
    ganzeKette: "Show the whole chain",
    llmTitle: "This step calls the LLM (Gemini)",
    korrigiert: "corrected",
    korrigiertTitle:
      "The self-critique found issues - the evaluation was repeated once with corrections",
  },
} as const;

type KnotenStatus =
  | "ausstehend"
  | "laeuft"
  | "fertig"
  | "uebersprungen"
  | "fehler";

type Auswahl = PipelineSchritt | "kette";

interface SchrittDetail {
  titel: Record<Sprache, string>;
  baustein: string; // LangChain-Baustein als Badge
  beschreibung: Record<Sprache, string>;
  datei: string;
  code: string;
}

/* Die Code-Ausschnitte sind (leicht gekuerzte) Originalzeilen aus dem Repo -
 * bei Aenderungen an der Pipeline hier mitpflegen. */
const DETAILS: Record<Auswahl, SchrittDetail> = {
  kette: {
    titel: { de: "Die ganze Kette", en: "The whole chain" },
    baustein: "LCEL · RunnableSequence + RunnableBranch",
    beschreibung: {
      de:
        "Die Screening-Pipeline ist eine deklarative LangChain-Kette (LCEL): " +
        "Schritte werden mit dem |-Operator komponiert, die Verzweigung nach " +
        "der K.O.-Prüfung übernimmt ein RunnableBranch - pures LangChain, " +
        "bewusst kein LangGraph. Diese Live-Ansicht entsteht direkt aus der " +
        "Kette: astream_events() meldet jeden benannten Schritt als Event, " +
        "die API streamt sie zeilenweise ans Frontend.",
      en:
        "The screening pipeline is a declarative LangChain chain (LCEL): " +
        "steps are composed with the | operator, and the branch after the " +
        "knock-out check is a RunnableBranch - pure LangChain, deliberately " +
        "no LangGraph. This live view comes straight from the chain: " +
        "astream_events() reports every named step as an event, and the API " +
        "streams them line by line to the frontend.",
    },
    datei: "core/pipeline.py · api/main.py",
    code: `# core/pipeline.py - die Kette (LCEL, kein LangGraph)
return (
    RunnableLambda(_extrahieren_und_klassifizieren, name="extraktion")
    | RunnableLambda(_ko_pruefung, name="ko_pruefung")
    | RunnableBranch(
        (
            lambda state: state["ko_grund"] is not None,
            RunnableLambda(_ko_ergebnis, name="ko_ablehnung"),
        ),
        bewertungs_zweig,
    )
)

# api/main.py - daraus entstehen die Events dieser Live-Ansicht
async for event in get_pipeline().astream_events(eingabe):
    if event["event"] == "on_chain_end" and name in PIPELINE_SCHRITTE:
        yield zeile({"typ": "schritt", "schritt": name})`,
  },
  extraktion: {
    titel: {
      de: "Extraktion & Klassifikation",
      en: "Extraction & classification",
    },
    baustein: "Chain: Prompt | LLM · with_structured_output",
    beschreibung: {
      de:
        "Jede hochgeladene PDF wird zu Text extrahiert und vom LLM " +
        "klassifiziert: Lebenslauf, Motivationsschreiben oder Sonstiges. " +
        "with_structured_output zwingt Gemini in ein Pydantic-Schema - statt " +
        "Freitext kommt ein validiertes Objekt zurück.",
      en:
        "Every uploaded PDF is extracted to text and classified by the LLM: " +
        "CV, cover letter or other. with_structured_output forces Gemini " +
        "into a Pydantic schema - instead of free text, a validated object " +
        "comes back.",
    },
    datei: "core/pipeline.py · core/klassifikation.py",
    code: `def _extrahieren_und_klassifizieren(state: dict) -> dict:
    dokumente = []
    for datei in state["dateien"]:
        text = extrahiere_pdf_text(datei["pfad"])
        klassifikation = klassifikations_chain.invoke(
            {"datei_name": datei["name"], "auszug": text[:1500]}
        )
        dokumente.append(
            {"name": datei["name"], "typ": klassifikation.typ, "text": text}
        )
    return {**state, "dokumente": dokumente}

# core/klassifikation.py - die Chain dahinter
KLASSIFIKATIONS_PROMPT | llm.with_structured_output(DokumentKlassifikation)`,
  },
  ko_pruefung: {
    titel: { de: "K.O.-Prüfung", en: "Knock-out check" },
    baustein: "RunnableLambda · kein LLM",
    beschreibung: {
      de:
        "Formale K.O.-Kriterien sind reines Python - deterministisch, " +
        "kostenlos, in Millisekunden erledigt. Direkt danach entscheidet ein " +
        "RunnableBranch über den Weg: K.O. führt zur sofortigen Ablehnung " +
        "ohne LLM, sonst folgt die volle Bewertung.",
      en:
        "Formal knock-out criteria are plain Python - deterministic, free, " +
        "done in milliseconds. Right after, a RunnableBranch decides the " +
        "path: a knock-out leads to immediate rejection without the LLM, " +
        "otherwise the full evaluation follows.",
    },
    datei: "core/pipeline.py",
    code: `def pruefe_ko(dokumente: list[dict], ko_kriterien: dict) -> KOGrund | None:
    typen = {d["typ"] for d in dokumente}
    if (
        ko_kriterien.get("lebenslauf_erforderlich", True)
        and DokumentTyp.LEBENSLAUF not in typen
    ):
        return KOGrund.LEBENSLAUF_FEHLT
    if (
        ko_kriterien.get("motivationsschreiben_erforderlich", False)
        and DokumentTyp.MOTIVATIONSSCHREIBEN not in typen
    ):
        return KOGrund.MOTIVATIONSSCHREIBEN_FEHLT
    return None`,
  },
  ko_ablehnung: {
    titel: { de: "Direkte Ablehnung", en: "Direct rejection" },
    baustein: "RunnableBranch · Zweig A",
    beschreibung: {
      de:
        "Der kurze Zweig: Fehlt ein Pflichtdokument, wird die Bewerbung ohne " +
        "jede LLM-Bewertung abgelehnt - mit dokumentiertem K.O.-Grund. Das " +
        "spart Kosten und Zeit und verhindert, dass unvollständige " +
        "Bewerbungen inhaltlich bewertet werden.",
      en:
        "The short branch: if a required document is missing, the " +
        "application is rejected without any LLM evaluation - with a " +
        "documented knock-out reason. That saves cost and time and prevents " +
        "incomplete applications from being evaluated on content.",
    },
    datei: "core/pipeline.py",
    code: `# Zweig A: K.O. -> direkte Ablehnung ohne Bewertung
def _ko_ergebnis(state: dict) -> dict:
    return {
        **state,
        "status": "abgelehnt",
        "bewertung": None,      # keine LLM-Bewertung noetig
        "gesamt_score": None,
        "empfehlung": None,
    }`,
  },
  zusammenfuehren: {
    titel: { de: "Zusammenführen", en: "Merge" },
    baustein: "RunnableLambda",
    beschreibung: {
      de:
        "Mehrteilige Lebensläufe (z. B. zwei getrennt hochgeladene PDFs) " +
        "werden zu einem CV-Text vereint, Motivationsschreiben bleiben " +
        "separat. Der Zustand fließt als dict durch die Kette - jeder Schritt " +
        "reichert ihn an, LangChain reicht ihn weiter.",
      en:
        "Multi-part CVs (e.g. two separately uploaded PDFs) are merged into " +
        "one CV text, cover letters stay separate. The state flows through " +
        "the chain as a dict - each step enriches it, LangChain passes it " +
        "along.",
    },
    datei: "core/pipeline.py",
    code: `def _texte_zusammenfuehren(state: dict) -> dict:
    cv_teile = [
        d["text"] for d in state["dokumente"]
        if d["typ"] == DokumentTyp.LEBENSLAUF
    ]
    motivation_teile = [
        d["text"] for d in state["dokumente"]
        if d["typ"] == DokumentTyp.MOTIVATIONSSCHREIBEN
    ]
    return {
        **state,
        "cv_text": "\\n\\n".join(cv_teile),
        "motivation_text": "\\n\\n".join(motivation_teile) or None,
    }`,
  },
  anonymisierung: {
    titel: { de: "Anonymisierung", en: "Anonymization" },
    baustein: "Chain: Prompt | LLM | StrOutputParser",
    beschreibung: {
      de:
        "Bias-Mitigation: Vor der Bewertung ersetzt das LLM Namen, " +
        "Geschlecht, Alter, Herkunft und Kontaktdaten durch [ENTFERNT] - die " +
        "Bewertung sieht nur noch Qualifikationen. Eine klassische " +
        "LCEL-Minikette: Prompt, Modell und Parser per |-Operator verbunden.",
      en:
        "Bias mitigation: before the evaluation, the LLM replaces name, " +
        "gender, age, origin and contact details with [ENTFERNT] (removed) - " +
        "the evaluation only sees qualifications. A classic LCEL mini-chain: " +
        "prompt, model and parser joined with the | operator.",
    },
    datei: "core/anonymization.py · core/pipeline.py",
    code: `# core/anonymization.py
ANONYMISIERUNGS_PROMPT | llm | StrOutputParser()

# core/pipeline.py
def _anonymisieren(state: dict) -> dict:
    cv_anonym = anonymisierungs_chain.invoke({"cv_text": state["cv_text"]})
    motivation_anonym = (
        anonymisierungs_chain.invoke({"cv_text": state["motivation_text"]})
        if state["motivation_text"]
        else KEIN_MOTIVATIONSSCHREIBEN
    )
    return {**state, "cv_text": cv_anonym, "motivation_text": motivation_anonym}`,
  },
  bewertung: {
    titel: { de: "Bewertung", en: "Evaluation" },
    baustein: "with_structured_output(Bewertung)",
    beschreibung: {
      de:
        "Das Herzstück: Gemini bewertet den anonymisierten CV gegen die " +
        "Stellenausschreibung - pro Kriterium ein Score von 1–10 mit " +
        "Begründung und wörtlichen Belegen aus den Unterlagen. Das " +
        "Pydantic-Schema erzwingt die Struktur, freie Formate sind " +
        "ausgeschlossen.",
      en:
        "The heart of it: Gemini evaluates the anonymized CV against the " +
        "job posting - one score from 1–10 per criterion, with a " +
        "justification and verbatim evidence quotes from the documents. The " +
        "Pydantic schema enforces the structure, free-form output is ruled " +
        "out.",
    },
    datei: "core/evaluation.py · core/schemas.py",
    code: `# core/evaluation.py
BEWERTUNGS_PROMPT | llm.with_structured_output(Bewertung)

# core/schemas.py - das erzwungene Schema
class Bewertung(BaseModel):
    kriterien: list[KriteriumScore]  # Score 1-10, Begruendung, Belege
    staerken: list[str]
    ablehnungsgruende: list[AblehnungsGrund]
    zusammenfassung: str`,
  },
  selbstkritik: {
    titel: { de: "Selbstkritik", en: "Self-critique" },
    baustein: "LLM-as-a-Judge · max. 1 Korrektur",
    beschreibung: {
      de:
        "Ein zweiter LLM-Aufruf prüft die eigene Bewertung: Sind alle Scores " +
        "durch die zitierten Belege gedeckt? Wenn nicht, wird die Bewertung " +
        "genau einmal mit den Beanstandungen als Hinweis wiederholt - bewusst " +
        "begrenzt, keine Endlosschleife.",
      en:
        "A second LLM call reviews the evaluation itself: is every score " +
        "backed by the quoted evidence? If not, the evaluation is repeated " +
        "exactly once with the objections as a hint - deliberately bounded, " +
        "no endless loop.",
    },
    datei: "core/pipeline.py",
    code: `def _pruefe_und_korrigiere(state: dict) -> dict:
    urteil = kritik_chain.invoke({
        "cv_text": state["cv_text"],
        "motivation_text": state["motivation_text"],
        "bewertung_json": state["bewertung"].model_dump_json(indent=2),
    })
    if urteil.belegt:
        return {**state, "korrigiert": False}

    neue_bewertung = bewertungs_chain.invoke({
        ...,
        "hinweis": KORREKTUR_HINWEIS.format("\\n- ".join(urteil.maengel)),
    })
    return {**state, "bewertung": neue_bewertung, "korrigiert": True}`,
  },
  score: {
    titel: { de: "Score & Empfehlung", en: "Score & recommendation" },
    baustein: "RunnableLambda · deterministisch",
    beschreibung: {
      de:
        "Aus den Kriterien-Scores wird ein gewichteter Gesamt-Score (10–100) " +
        "berechnet und in eine Empfehlung übersetzt: Einladen, Prüfen oder " +
        "Ablehnen. Bewusst reines Python statt LLM - reproduzierbar und " +
        "transparent gewichtet. Die finale Entscheidung trifft ein Mensch.",
      en:
        "The criteria scores are combined into a weighted total score " +
        "(10–100) and translated into a recommendation: invite, review or " +
        "reject. Deliberately plain Python instead of the LLM - reproducible " +
        "and transparently weighted. The final decision is made by a human.",
    },
    datei: "core/ranking.py",
    code: `def berechne_gesamtscore(bewertung: Bewertung) -> float:
    """Gewichtete Summe der Kriterien-Scores, skaliert auf 10-100."""
    scores = {ks.kriterium.value: ks.score for ks in bewertung.kriterien}
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
    return "Ablehnen"`,
  },
};

export default function PipelineOverlay({
  offen,
  onSchliessen,
  kandidat,
  stand,
  laeuft,
  fehlgeschlagen,
  ergebnis,
}: {
  offen: boolean;
  onSchliessen: () => void;
  kandidat: string | null;
  stand?: LiveStand;
  laeuft: boolean;
  fehlgeschlagen: boolean;
  ergebnis?: ScreeningErgebnis;
}) {
  const { sprache } = useSprache();
  const t = T[sprache];
  const [auswahl, setAuswahl] = useState<Auswahl | null>(null);
  const [jetzt, setJetzt] = useState(0); // Live-Uhr fuer den laufenden Schritt
  const flowRef = useRef<HTMLDivElement>(null);

  // Schliessen setzt die Auswahl zurueck: Beim naechsten Oeffnen folgt die
  // Erklaerung wieder automatisch der Analyse
  const schliessen = () => {
    setAuswahl(null);
    onSchliessen();
  };

  useEffect(() => {
    if (!offen) return;
    const taste = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAuswahl(null);
        onSchliessen();
      }
    };
    window.addEventListener("keydown", taste);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", taste);
      document.body.style.overflow = "";
    };
  }, [offen, onSchliessen]);

  useEffect(() => {
    if (!offen || !laeuft) return;
    const uhr = setInterval(() => setJetzt(Date.now()), 250);
    return () => clearInterval(uhr);
  }, [offen, laeuft]);

  // --- Status & Zeiten aus dem gestreamten Stand ableiten -------------------
  const fertigIds = new Set((stand?.fertig ?? []).map((e) => e.schritt));
  const zweigBekannt = stand !== undefined && stand.koGrund !== undefined;
  const ko = zweigBekannt && stand?.koGrund !== null;
  const pfad: Knoten[] = [
    ...HAUPT_KNOTEN,
    ...(zweigBekannt ? (ko ? [KO_KNOTEN] : BEWERTUNGS_ZWEIG_KNOTEN) : []),
  ];
  const aktiverSchritt = stand
    ? pfad.find((k) => !fertigIds.has(k.id))?.id
    : undefined;

  const status = (id: PipelineSchritt): KnotenStatus => {
    if (fertigIds.has(id)) return "fertig";
    if (id === aktiverSchritt && fehlgeschlagen) return "fehler";
    if (id === aktiverSchritt && laeuft) return "laeuft";
    const imKoZweig = id === KO_KNOTEN.id;
    const imBewertungsZweig = BEWERTUNGS_ZWEIG_KNOTEN.some((k) => k.id === id);
    if (zweigBekannt && (ko ? imBewertungsZweig : imKoZweig))
      return "uebersprungen";
    return "ausstehend";
  };

  // Dauer pro Schritt (die Events tragen kumulierte Zeiten seit Start)
  const dauern = new Map<PipelineSchritt, number>();
  let vorher = 0;
  for (const eintrag of stand?.fertig ?? []) {
    dauern.set(eintrag.schritt, eintrag.ms - vorher);
    vorher = eintrag.ms;
  }
  const laufendeDauer =
    laeuft && stand?.startZeit && jetzt
      ? Math.max(0, jetzt - stand.startZeit - vorher)
      : undefined;

  // Beim Live-Folgen den aktiven Knoten im Flow sichtbar halten
  useEffect(() => {
    if (!offen || !laeuft || !aktiverSchritt) return;
    flowRef.current
      ?.querySelector(`[data-knoten="${aktiverSchritt}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [offen, laeuft, aktiverSchritt]);

  if (!offen) return null;

  // Ohne Pin folgt die Erklaerung dem laufenden Schritt, sonst der Ueberblick
  const anzeige: Auswahl =
    auswahl ?? (laeuft && aktiverSchritt ? aktiverSchritt : "kette");
  const detail = DETAILS[anzeige];

  const knotenKlick = (id: PipelineSchritt) =>
    setAuswahl(id === auswahl ? null : id);

  const knoten = (k: Knoten) => (
    <FlussKnoten
      key={k.id}
      knoten={k}
      label={KNOTEN_LABELS[sprache][k.id]}
      status={status(k.id)}
      gewaehlt={anzeige === k.id}
      dauerMs={
        status(k.id) === "laeuft" ? laufendeDauer : dauern.get(k.id)
      }
      korrigiert={k.id === "selbstkritik" && stand?.korrigiert}
      onKlick={() => knotenKlick(k.id)}
    />
  );

  return (
    // Klick auf den abgedunkelten Hintergrund schliesst; Klicks im Dialog
    // selbst duerfen nicht durchschlagen (stopPropagation)
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 sm:p-8"
      onClick={schliessen}
    >
      <div
        className="rise-in flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line bg-canvas shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t.dialogAria}
      >
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <h2 className="font-serif text-2xl italic">{t.titel}</h2>
            <p className="mt-0.5 text-sm text-ink-faint">
              {t.untertitel}{" "}
              <code className="text-xs">astream_events()</code>
            </p>
          </div>
          <div className="flex items-center gap-4">
            {kandidat && (
              <span className="text-sm text-ink-soft">
                {laeuft && <Spinner />}{" "}
                <span className="font-medium">{kandidat}</span>
              </span>
            )}
            {ergebnis && (
              <span className="flex items-center gap-2">
                {ergebnis.gesamt_score !== null && (
                  <span className="font-serif text-xl">
                    {formatScore(ergebnis.gesamt_score, sprache)}
                    <span className="text-xs text-ink-faint">/100</span>
                  </span>
                )}
                <StatusChip
                  status={ergebnis.status}
                  ko={ergebnis.ko_grund !== null}
                  empfehlung={ergebnis.empfehlung}
                />
              </span>
            )}
            <button
              onClick={schliessen}
              aria-label={t.schliessenAria}
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink-soft transition-colors hover:border-tanne hover:text-ink"
            >
              {t.schliessen}
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Flow-Chart: der Weg von oben nach unten */}
          <div
            ref={flowRef}
            className="w-72 shrink-0 overflow-y-auto border-r border-line px-5 py-5"
          >
            {knoten(HAUPT_KNOTEN[0])}
            <Verbindung aktiv={fertigIds.has("extraktion")} />
            {knoten(HAUPT_KNOTEN[1])}

            {/* Verzweigung: rechts der K.O.-Ausstieg, unten geht es weiter */}
            <div
              className={`ml-5 border-l-2 ${
                zweigBekannt && !ko ? "border-tanne" : "border-line"
              }`}
            >
              <div className="flex items-center pt-2">
                <div
                  className={`h-0 w-3 border-t-2 ${
                    zweigBekannt && ko ? "border-tanne" : "border-line"
                  }`}
                />
                <span className="mx-1.5 text-[10px] text-ink-faint">
                  {t.ko}
                </span>
                <div className="min-w-0 flex-1">{knoten(KO_KNOTEN)}</div>
              </div>
              <p className="py-1.5 pl-2 text-[10px] text-ink-faint">
                {t.bestanden}
              </p>
            </div>

            {BEWERTUNGS_ZWEIG_KNOTEN.map((k, i) => (
              <span key={k.id}>
                {i > 0 && (
                  <Verbindung
                    aktiv={fertigIds.has(BEWERTUNGS_ZWEIG_KNOTEN[i - 1].id)}
                  />
                )}
                {knoten(k)}
              </span>
            ))}
          </div>

          {/* Erklaerung & Code zum gewaehlten bzw. laufenden Schritt */}
          <div className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="font-serif text-xl italic">
                  {detail.titel[sprache]}
                </h3>
                <span className="rounded-full bg-tanne-soft px-2.5 py-0.5 font-mono text-[11px] text-tanne-deep">
                  {detail.baustein}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {auswahl !== null && laeuft && (
                  <button
                    onClick={() => setAuswahl(null)}
                    className="text-xs font-medium text-tanne transition-colors hover:text-tanne-deep"
                  >
                    {t.liveFolgen}
                  </button>
                )}
                {anzeige !== "kette" && (
                  <button
                    onClick={() => setAuswahl("kette")}
                    className="text-xs text-ink-faint transition-colors hover:text-ink"
                  >
                    {t.ganzeKette}
                  </button>
                )}
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              {detail.beschreibung[sprache]}
            </p>
            <CodeBlock datei={detail.datei} code={detail.code} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Verbindung({ aktiv }: { aktiv: boolean }) {
  return (
    <div
      className={`ml-5 h-5 border-l-2 ${aktiv ? "border-tanne" : "border-line"}`}
    />
  );
}

const KNOTEN_STIL: Record<KnotenStatus, string> = {
  ausstehend: "border-line text-ink-soft",
  laeuft: "border-tanne bg-tanne-soft text-tanne-deep",
  fertig: "border-line-strong text-ink",
  uebersprungen: "border-dashed border-line text-ink-faint opacity-50",
  fehler: "border-rot bg-rot-soft text-rot",
};

function FlussKnoten({
  knoten,
  label,
  status,
  gewaehlt,
  dauerMs,
  korrigiert,
  onKlick,
}: {
  knoten: Knoten;
  label: string;
  status: KnotenStatus;
  gewaehlt: boolean;
  dauerMs?: number;
  korrigiert?: boolean;
  onKlick: () => void;
}) {
  const { sprache } = useSprache();
  const t = T[sprache];
  return (
    <button
      data-knoten={knoten.id}
      onClick={onKlick}
      className={`flex w-full items-center gap-2 rounded-lg border bg-surface px-3 py-2 text-left text-sm transition-all hover:border-tanne ${
        KNOTEN_STIL[status]
      } ${gewaehlt ? "ring-2 ring-tanne/40" : ""}`}
    >
      <span className="w-4 shrink-0 text-center">
        {status === "laeuft" ? (
          <Spinner />
        ) : status === "fertig" ? (
          <span className="text-tanne">✓</span>
        ) : status === "fehler" ? (
          "✕"
        ) : (
          <span className="text-xs text-ink-faint">○</span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        {label}
        {knoten.llm && (
          <span
            className="ml-1.5 rounded border border-current px-1 text-[9px] uppercase tracking-wide opacity-60"
            title={t.llmTitle}
          >
            LLM
          </span>
        )}
        {korrigiert && (
          <span
            className="ml-1.5 rounded-full bg-gold-soft px-1.5 text-[10px] font-medium text-gold"
            title={t.korrigiertTitle}
          >
            {t.korrigiert}
          </span>
        )}
      </span>
      {dauerMs !== undefined && (
        <span className="shrink-0 text-[10px] text-ink-faint">
          {(dauerMs / 1000).toLocaleString(LOCALES[sprache], {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })}
          &thinsp;s
        </span>
      )}
    </button>
  );
}

/** Hebt LangChain-Bausteine im Code hervor und dimmt Kommentare -
 *  bewusst simpel (zeilen-/tokenbasiert) statt echtem Highlighter. */
const LANGCHAIN_TOKENS =
  /(RunnableLambda|RunnableBranch|RunnablePassthrough|RunnableSequence|with_structured_output|astream_events|StrOutputParser|ChatPromptTemplate|\.invoke)/g;

function CodeBlock({ datei, code }: { datei: string; code: string }) {
  return (
    <div className="mt-4 overflow-hidden rounded-lg bg-ink">
      <p className="border-b border-canvas/10 px-4 py-2 font-mono text-[11px] text-canvas/50">
        {datei}
      </p>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-xs leading-relaxed text-canvas/90">
        {code.split("\n").map((zeile, i) => (
          <div
            key={i}
            className={zeile.trimStart().startsWith("#") ? "text-canvas/45" : ""}
          >
            {zeile
              ? zeile
                  .split(LANGCHAIN_TOKENS)
                  .map((teil, j) =>
                    j % 2 === 1 ? (
                      <span key={j} className="font-medium text-tanne-soft">
                        {teil}
                      </span>
                    ) : (
                      teil
                    ),
                  )
              : " "}
          </div>
        ))}
      </pre>
    </div>
  );
}
