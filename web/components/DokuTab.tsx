"use client";

import { useEffect, useState } from "react";
import { fetchKonfiguration } from "@/lib/api";
import { useSprache, type Sprache } from "@/lib/i18n";
import type { Konfiguration, Labels } from "@/lib/types";
import { EmpfehlungChip, formatScore, ScoreBar, StatusChip } from "./ui";

/** Doku fuer Teammitglieder: Wie funktioniert das Screening, wie entsteht
 *  der Score? Gewichte/Schwellen kommen live aus /api/konfiguration und
 *  koennen daher nie vom Code abweichen. */

interface Schritt {
  titel: string;
  text: string;
  datei: string;
  llm: string | null; // null = deterministisch, sonst Beschreibung der Aufrufe
}

const SCHRITTE: Record<Sprache, Schritt[]> = {
  de: [
    {
      titel: "Posteingang",
      text: "Der Bulk-Upload nimmt gemischte PDFs an. Pro Datei bestimmt ein LLM-Aufruf, welche Dokumente darin stecken (Segmente als Seitenbereiche), von wem sie stammen und wo ein Dokument endet. Ein Sammel-PDF aus zweiseitigem Lebenslauf und Anschreiben wird von pypdf physisch aufgeteilt. Dokumente mit demselben erkannten Namen landen in derselben Bewerbung.",
      datei: "core/eingang.py",
      llm: "1 Aufruf pro hochgeladenem PDF",
    },
    {
      titel: "Extraktion",
      text: "PyPDFLoader zieht den Text aus jedem PDF, einfaches Cleaning entfernt Mehrfach-Leerzeichen und Leerzeilen-Stapel. Gescannte PDFs ohne Textebene werden mit einer klaren Fehlermeldung abgewiesen (kein OCR).",
      datei: "core/extraction.py",
      llm: null,
    },
    {
      titel: "Klassifikation",
      text: "Jede Datei der Bewerbung wird als Lebenslauf, Motivationsschreiben oder Sonstiges eingestuft (Dateiname + Textauszug, Structured Output). Mehrteilige Lebensläufe werden später zu einem Text zusammengeführt.",
      datei: "core/klassifikation.py",
      llm: "1 Aufruf pro Datei",
    },
    {
      titel: "K.O.-Prüfung",
      text: "Reine Python-Logik über den Klassifikations-Ergebnissen: Fehlt ein als erforderlich markiertes Dokument, endet die Pipeline hier. Die Bewerbung wird ohne LLM-Bewertung abgelehnt und der Grund im Verlauf vermerkt. Technisch ist das ein RunnableBranch in der LCEL-Kette.",
      datei: "core/pipeline.py",
      llm: null,
    },
    {
      titel: "Anonymisierung",
      text: "Bevor bewertet wird, entfernt ein LLM-Schritt Name, Geschlecht, Alter, Herkunft und Kontaktdaten aus den Texten (Bias-Mitigation). Das bewertende LLM sieht nur fachliche Inhalte; im Dashboard bleibt der Name für HR natürlich sichtbar.",
      datei: "core/anonymization.py",
      llm: "1 Aufruf pro Dokumentart (CV, Anschreiben)",
    },
    {
      titel: "Bewertung",
      text: "Das Herzstück: Das LLM bewertet die vier Kriterien einzeln nach einer festen Rubrik (1–2 keine Anzeichen … 9–10 übertrifft die Anforderungen) und muss jeden Score mit wörtlichen Zitaten aus den Unterlagen belegen. Die Antwort ist per Pydantic-Schema erzwungen strukturiert, inklusive Ablehnungsgründen als feste Kategorien statt Freitext. Das Motivationsschreiben dient als Kontext, ersetzt aber keine fehlende Qualifikation im CV.",
      datei: "core/evaluation.py · core/schemas.py",
      llm: "1 Aufruf",
    },
    {
      titel: "Selbstkritik",
      text: "Ein zweiter, unabhängiger LLM-Aufruf prüft die Bewertung gegen die Unterlagen: Finden sich die Zitate wirklich im Text? Passt die Score-Höhe zur Begründung? Bei Beanstandung wird die Bewertung genau einmal mit den Korrekturhinweisen wiederholt (bewusst begrenzt, keine Endlosschleife). Korrigierte Bewertungen sind im Verlauf markiert.",
      datei: "core/evaluation.py · core/pipeline.py",
      llm: "1 Aufruf (+1 bei Korrektur)",
    },
    {
      titel: "Score & Einstufung",
      text: "Der Gesamt-Score wird NICHT vom LLM vergeben, sondern deterministisch in Python berechnet (Details unten). Daraus folgt die Empfehlung, daraus der Status. Alles landet in SQLite, der Verlauf überlebt also Neustarts.",
      datei: "core/ranking.py · core/storage.py",
      llm: null,
    },
  ],
  en: [
    {
      titel: "Inbox",
      text: "The bulk upload accepts mixed PDFs. For each file, one LLM call determines which documents it contains (segments as page ranges), who they belong to and where a document ends. A combined PDF of a two-page CV plus cover letter is physically split by pypdf. Documents with the same detected name end up in the same application.",
      datei: "core/eingang.py",
      llm: "1 call per uploaded PDF",
    },
    {
      titel: "Extraction",
      text: "PyPDFLoader pulls the text out of each PDF; simple cleaning removes repeated spaces and stacks of blank lines. Scanned PDFs without a text layer are rejected with a clear error message (no OCR).",
      datei: "core/extraction.py",
      llm: null,
    },
    {
      titel: "Classification",
      text: "Each file of the application is classified as CV, cover letter or other (file name + text excerpt, structured output). Multi-part CVs are merged into one text later.",
      datei: "core/klassifikation.py",
      llm: "1 call per file",
    },
    {
      titel: "Knock-out check",
      text: "Plain Python logic over the classification results: if a document marked as required is missing, the pipeline ends here. The application is rejected without an LLM evaluation and the reason is recorded in the history. Technically this is a RunnableBranch in the LCEL chain.",
      datei: "core/pipeline.py",
      llm: null,
    },
    {
      titel: "Anonymization",
      text: "Before the evaluation, an LLM step removes name, gender, age, origin and contact details from the texts (bias mitigation). The evaluating LLM only sees professional content; in the dashboard the name of course stays visible for HR.",
      datei: "core/anonymization.py",
      llm: "1 call per document type (CV, cover letter)",
    },
    {
      titel: "Evaluation",
      text: "The heart of it: the LLM scores the four criteria individually against a fixed rubric (1–2 no evidence … 9–10 exceeds the requirements) and has to back every score with verbatim quotes from the documents. The response is forced into a Pydantic schema, including rejection reasons as fixed categories instead of free text. The cover letter serves as context but does not replace a missing qualification in the CV.",
      datei: "core/evaluation.py · core/schemas.py",
      llm: "1 call",
    },
    {
      titel: "Self-critique",
      text: "A second, independent LLM call checks the evaluation against the documents: are the quotes really in the text? Does the score level match the justification? If it objects, the evaluation is repeated exactly once with the correction hints (deliberately bounded, no endless loop). Corrected evaluations are marked in the history.",
      datei: "core/evaluation.py · core/pipeline.py",
      llm: "1 call (+1 on correction)",
    },
    {
      titel: "Score & classification",
      text: "The total score is NOT assigned by the LLM but computed deterministically in Python (details below). The recommendation follows from it, the status from that. Everything is stored in SQLite, so the history survives restarts.",
      datei: "core/ranking.py · core/storage.py",
      llm: null,
    },
  ],
};

const T = {
  de: {
    laden: "Lade…",
    llmBadge: "LLM",
    deterministisch: "deterministisch",
    schritteTitel: "Was passiert mit einer Bewerbung?",
    agentTitel: "Der Assistent: hier arbeitet ein Agent",
    agentDatei: "1 LLM-Aufruf pro Werkzeug-Runde",
    scoreTitel: "Wie entsteht der Score?",
    zumAusprobieren: "Zum Ausprobieren",
    gewicht: "Gewicht",
    ergebnisTitel: "Was am Ende rauskommen kann",
    ergebnisIntro:
      "Diese Markierungen begegnen dir im Live-Flow während der Analyse, im Genehmigt-Tab und im Verlauf:",
    korrigiert: "korrigiert",
    koTitel: "K.O.-Kriterien & Ablehnungsgründe",
    stackTitel: "Stack & Grenzen",
    stack: "Stack",
    grenzen: "Grenzen",
    nachvollziehen: "Selbst nachvollziehen",
  },
  en: {
    laden: "Loading…",
    llmBadge: "LLM",
    deterministisch: "deterministic",
    schritteTitel: "What happens to an application?",
    agentTitel: "The assistant: an agent at work",
    agentDatei: "1 LLM call per tool round",
    scoreTitel: "How is the score computed?",
    zumAusprobieren: "Try it out",
    gewicht: "Weight",
    ergebnisTitel: "What can come out at the end",
    ergebnisIntro:
      "You will run into these markers in the live flow during analysis, in the Approved tab and in the history:",
    korrigiert: "corrected",
    koTitel: "Knock-out criteria & rejection reasons",
    stackTitel: "Stack & limitations",
    stack: "Stack",
    grenzen: "Limitations",
    nachvollziehen: "Reproduce it yourself",
  },
} as const;

export default function DokuTab({ labels }: { labels: Labels }) {
  const { sprache } = useSprache();
  const t = T[sprache];
  const de = sprache === "de";
  const [konfig, setKonfig] = useState<Konfiguration | null>(null);
  const [demoScores, setDemoScores] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchKonfiguration().then((k) => {
      setKonfig(k);
      // Startwerte fuer den interaktiven Rechner
      setDemoScores(
        Object.fromEntries(Object.keys(k.gewichte).map((name) => [name, 7])),
      );
    });
  }, []);

  if (!konfig) return <p className="text-sm text-ink-faint">{t.laden}</p>;

  const gesamt =
    Object.entries(konfig.gewichte).reduce(
      (summe, [name, gewicht]) => summe + gewicht * (demoScores[name] ?? 1),
      0,
    ) * 10;
  const empfehlung =
    gesamt >= konfig.schwelle_einladen
      ? "Einladen"
      : gesamt >= konfig.schwelle_pruefen
        ? "Pruefen"
        : "Ablehnen";

  return (
    <div className="mx-auto max-w-2xl space-y-14">
      <section>
        <p className="text-sm leading-relaxed text-ink-soft">
          {de ? (
            <>
              Diese Seite erklärt, was zwischen PDF-Upload und Ranking
              passiert: ein Einstieg für alle, die am Code mitarbeiten oder
              die Ergebnisse nachvollziehen wollen. Kern sind eine{" "}
              <strong className="font-medium text-ink">
                LangChain-LCEL-Pipeline
              </strong>{" "}
              fürs Screening und ein{" "}
              <strong className="font-medium text-ink">
                Tool-Calling-Agent
              </strong>{" "}
              für den Assistent-Tab (beides pures LangChain, kein LangGraph),
              Modell{" "}
              <code className="rounded bg-surface px-1 py-0.5 text-xs">
                {konfig.modell}
              </code>{" "}
              mit{" "}
              <code className="rounded bg-surface px-1 py-0.5 text-xs">
                temperature=0
              </code>{" "}
              für reproduzierbare Bewertungen.
            </>
          ) : (
            <>
              This page explains what happens between PDF upload and ranking:
              a starting point for everyone who works on the code or wants to
              understand the results. At the core are a{" "}
              <strong className="font-medium text-ink">
                LangChain LCEL pipeline
              </strong>{" "}
              for the screening and a{" "}
              <strong className="font-medium text-ink">
                tool-calling agent
              </strong>{" "}
              for the Assistant tab (both pure LangChain, no LangGraph), model{" "}
              <code className="rounded bg-surface px-1 py-0.5 text-xs">
                {konfig.modell}
              </code>{" "}
              with{" "}
              <code className="rounded bg-surface px-1 py-0.5 text-xs">
                temperature=0
              </code>{" "}
              for reproducible evaluations.
            </>
          )}
        </p>
      </section>

      {/* --- Pipeline-Schritte ------------------------------------------ */}
      <section>
        <h2 className="font-serif text-2xl italic">{t.schritteTitel}</h2>
        <ol className="mt-6 space-y-0">
          {SCHRITTE[sprache].map((schritt, i) => (
            <li key={schritt.titel} className="relative flex gap-5 pb-8">
              {i < SCHRITTE[sprache].length - 1 && (
                <span
                  aria-hidden
                  className="absolute top-8 left-[0.9rem] h-full w-px bg-line"
                />
              )}
              <span className="z-10 flex size-7 shrink-0 items-center justify-center rounded-full border border-line bg-surface font-serif text-sm">
                {i + 1}
              </span>
              <div>
                <h3 className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-medium">{schritt.titel}</span>
                  <span
                    className={`rounded-full px-2 py-px text-[10px] font-medium tracking-wide uppercase ${
                      schritt.llm
                        ? "bg-gold-soft text-gold"
                        : "bg-tanne-soft text-tanne-deep"
                    }`}
                  >
                    {schritt.llm ? t.llmBadge : t.deterministisch}
                  </span>
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                  {schritt.text}
                </p>
                <p className="mt-1.5 text-xs text-ink-faint">
                  <code>{schritt.datei}</code>
                  {schritt.llm && <> · {schritt.llm}</>}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* --- Assistent (Agent) -------------------------------------------- */}
      <section>
        <h2 className="font-serif text-2xl italic">{t.agentTitel}</h2>
        {de ? (
          <>
            <p className="mt-4 text-sm leading-relaxed text-ink-soft">
              Das Screening oben ist eine <em>feste</em> Kette - jede
              Bewerbung durchläuft dieselben Schritte in derselben
              Reihenfolge. Das ist Absicht: reproduzierbare Scores, planbare
              Kosten, auditierbarer Ablauf. Der Assistent-Tab funktioniert
              anders: Dort bekommt das LLM fünf Lese-Werkzeuge
              (Ergebnisliste, Einzelbewertung, Vergleich, Statistik,
              Stellenausschreibung) und entscheidet pro Runde selbst, welche
              es mit welchen Argumenten aufruft - oder ob es genug weiß und
              antwortet. Eine Frage wie „Warum ist Ben rausgeflogen, und wäre
              er ohne K.O. besser als Clara?“ löst so eine Mehrschritt-Kette
              aus: Ablehnung nachschlagen, Bewertungen holen, vergleichen.
              Die aufgerufenen Werkzeuge werden unter jeder Antwort
              eingeblendet.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              Der Agent-Loop ist mit LangChain-Primitiven gebaut (
              <code className="text-xs">bind_tools</code> +{" "}
              <code className="text-xs">ToolMessage</code>), nicht mit
              LangGraph, und auf fünf Werkzeug-Runden begrenzt. Alle
              Werkzeuge lesen nur - der Agent kann keine Bewertungen ändern.
            </p>
          </>
        ) : (
          <>
            <p className="mt-4 text-sm leading-relaxed text-ink-soft">
              The screening above is a <em>fixed</em> chain - every
              application goes through the same steps in the same order. That
              is intentional: reproducible scores, predictable cost, an
              auditable process. The Assistant tab works differently: there
              the LLM gets five read-only tools (result list, single
              evaluation, comparison, statistics, job posting) and decides
              each round on its own which to call with which arguments - or
              whether it knows enough and answers. A question like “Why was
              Ben rejected, and would he beat Clara without the knock-out?”
              triggers a multi-step chain: look up the rejection, fetch the
              evaluations, compare. The tools that were called are shown
              below each answer.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              The agent loop is built from LangChain primitives (
              <code className="text-xs">bind_tools</code> +{" "}
              <code className="text-xs">ToolMessage</code>), not with
              LangGraph, and is limited to five tool rounds. All tools are
              read-only - the agent cannot change any evaluations.
            </p>
          </>
        )}
        <p className="mt-1.5 text-xs text-ink-faint">
          <code>core/agent.py</code> · {t.agentDatei}
        </p>
      </section>

      {/* --- Score ------------------------------------------------------- */}
      <section>
        <h2 className="font-serif text-2xl italic">{t.scoreTitel}</h2>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          {de ? (
            <>
              Das LLM vergibt pro Kriterium 1–10 nach fester Rubrik; den
              Gesamt-Score rechnet Python als gewichtete Summe, skaliert auf
              10–100. LLMs sind als Gesamt-Urteiler schlecht kalibriert
              (Scores clustern um 7–8); die Mathe-Schicht macht das Ranking
              reproduzierbar und die Gewichtung diskutierbar. Sie steht in{" "}
              <code className="text-xs">core/config.py</code>.
            </>
          ) : (
            <>
              The LLM assigns 1–10 per criterion against a fixed rubric; the
              total score is computed in Python as a weighted sum, scaled to
              10–100. LLMs are poorly calibrated as overall judges (scores
              cluster around 7–8); the math layer makes the ranking
              reproducible and the weighting debatable. It lives in{" "}
              <code className="text-xs">core/config.py</code>.
            </>
          )}
        </p>

        <div className="mt-6 rounded-xl border border-line bg-surface p-5">
          <p className="text-xs tracking-wide text-ink-faint uppercase">
            {t.zumAusprobieren}
          </p>
          <div className="mt-4 space-y-4">
            {Object.entries(konfig.gewichte).map(([name, gewicht]) => (
              <div key={name}>
                <div className="flex items-baseline justify-between text-sm">
                  <label htmlFor={`demo-${name}`} className="font-medium">
                    {labels.kriterien[name] ?? name}
                    <span className="ml-2 text-xs font-normal text-ink-faint">
                      {t.gewicht} {Math.round(gewicht * 100)}%
                    </span>
                  </label>
                  <span className="font-serif">
                    {demoScores[name] ?? 1}
                    <span className="text-xs text-ink-faint">/10</span>
                  </span>
                </div>
                <input
                  id={`demo-${name}`}
                  type="range"
                  min={1}
                  max={10}
                  value={demoScores[name] ?? 1}
                  onChange={(e) =>
                    setDemoScores((s) => ({
                      ...s,
                      [name]: Number(e.target.value),
                    }))
                  }
                  className="mt-1 w-full accent-tanne"
                />
                <ScoreBar score={demoScores[name] ?? 1} />
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-baseline justify-between border-t border-line pt-4">
            <span className="text-sm text-ink-soft">
              Σ {de ? "Gewicht × Score" : "weight × score"} × 10 =
            </span>
            <span className="flex items-center gap-3">
              <EmpfehlungChip empfehlung={empfehlung} />
              <span className="font-serif text-3xl">
                {formatScore(gesamt, sprache)}
                <span className="ml-1 text-sm text-ink-faint">/100</span>
              </span>
            </span>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          {de ? (
            <>
              Ab{" "}
              <strong className="font-medium text-ink">
                {formatScore(konfig.schwelle_einladen, sprache)}
              </strong>{" "}
              lautet die Empfehlung <em>Einladen</em>, ab{" "}
              <strong className="font-medium text-ink">
                {formatScore(konfig.schwelle_pruefen, sprache)}
              </strong>{" "}
              <em>Prüfen</em>, darunter <em>Ablehnen</em>. Im Tab
              „Genehmigt“ landet, wer nicht abgelehnt wurde; die finale
              Entscheidung trifft immer ein Mensch. Kleine Unterschiede
              (±5 Punkte) sind nicht signifikant.
            </>
          ) : (
            <>
              From{" "}
              <strong className="font-medium text-ink">
                {formatScore(konfig.schwelle_einladen, sprache)}
              </strong>{" "}
              the recommendation is <em>invite</em>, from{" "}
              <strong className="font-medium text-ink">
                {formatScore(konfig.schwelle_pruefen, sprache)}
              </strong>{" "}
              <em>review</em>, below that <em>reject</em>. Whoever is not
              rejected lands in the Approved tab; the final decision is
              always made by a human. Small differences (±5 points) are not
              significant.
            </>
          )}
        </p>
      </section>

      {/* --- Ergebnis-Markierungen ---------------------------------------- */}
      <section>
        <h2 className="font-serif text-2xl italic">{t.ergebnisTitel}</h2>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          {t.ergebnisIntro}
        </p>
        <dl className="mt-5 space-y-4">
          <div className="flex items-start gap-4">
            <dt className="w-28 shrink-0 pt-0.5">
              <StatusChip status="genehmigt" empfehlung="Einladen" />
            </dt>
            <dd className="text-sm leading-relaxed text-ink-soft">
              {de ? (
                <>
                  Screening bestanden mit Gesamt-Score ab{" "}
                  {formatScore(konfig.schwelle_einladen, sprache)} -
                  Empfehlung <em>Einladen</em>.
                </>
              ) : (
                <>
                  Passed the screening with a total score of{" "}
                  {formatScore(konfig.schwelle_einladen, sprache)} or more -
                  recommendation <em>invite</em>.
                </>
              )}
            </dd>
          </div>
          <div className="flex items-start gap-4">
            <dt className="w-28 shrink-0 pt-0.5">
              <StatusChip status="genehmigt" empfehlung="Pruefen" />
            </dt>
            <dd className="text-sm leading-relaxed text-ink-soft">
              {de ? (
                <>
                  Der Graubereich (
                  {formatScore(konfig.schwelle_pruefen, sprache)}–
                  {formatScore(konfig.schwelle_einladen, sprache)}): hat das
                  Screening überstanden und landet im Genehmigt-Tab, verdient
                  aber einen genaueren menschlichen Blick.
                </>
              ) : (
                <>
                  The grey area (
                  {formatScore(konfig.schwelle_pruefen, sprache)}–
                  {formatScore(konfig.schwelle_einladen, sprache)}): made it
                  through the screening and lands in the Approved tab, but
                  deserves a closer human look.
                </>
              )}
            </dd>
          </div>
          <div className="flex items-start gap-4">
            <dt className="w-28 shrink-0 pt-0.5">
              <StatusChip status="abgelehnt" />
            </dt>
            <dd className="text-sm leading-relaxed text-ink-soft">
              {de ? (
                <>
                  Inhaltlich bewertet, aber unter{" "}
                  {formatScore(konfig.schwelle_pruefen, sprache)} Punkten -
                  die Schwachstellen stehen als Ablehnungsgründe im Verlauf.
                </>
              ) : (
                <>
                  Evaluated on content but below{" "}
                  {formatScore(konfig.schwelle_pruefen, sprache)} points -
                  the weaknesses are recorded as rejection reasons in the
                  history.
                </>
              )}
            </dd>
          </div>
          <div className="flex items-start gap-4">
            <dt className="w-28 shrink-0 pt-0.5">
              <StatusChip status="abgelehnt" ko />
            </dt>
            <dd className="text-sm leading-relaxed text-ink-soft">
              {de ? (
                <>
                  Am Formal-Check gescheitert (Pflichtdokument fehlt):
                  direkte Ablehnung <em>vor</em> der Bewertung - deshalb ohne
                  Score und ohne LLM-Einschätzung.
                </>
              ) : (
                <>
                  Failed the formal check (a required document is missing):
                  direct rejection <em>before</em> the evaluation - which is
                  why there is no score and no LLM assessment.
                </>
              )}
            </dd>
          </div>
          <div className="flex items-start gap-4">
            <dt className="w-28 shrink-0 pt-0.5">
              <span className="rounded-full bg-gold-soft px-2.5 py-0.5 text-xs font-medium text-gold">
                {t.korrigiert}
              </span>
            </dt>
            <dd className="text-sm leading-relaxed text-ink-soft">
              {de ? (
                <>
                  Die Selbstkritik hat die erste Bewertung beanstandet - etwa
                  ein Beleg-Zitat, das so nicht im CV steht - und die
                  Bewertung wurde genau einmal mit den Korrekturhinweisen
                  wiederholt. Angezeigt wird immer die korrigierte Fassung.
                  Das sagt nichts über die Person aus, sondern zeigt, dass
                  die Qualitätssicherung gegriffen hat; die Scores dort mit
                  etwas mehr Vorsicht lesen.
                </>
              ) : (
                <>
                  The self-critique flagged the first evaluation - for
                  example an evidence quote that is not actually in the CV -
                  and the evaluation was repeated exactly once with the
                  correction hints. The corrected version is always the one
                  shown. It says nothing about the person; it shows that the
                  quality check kicked in - read those scores with a bit more
                  caution.
                </>
              )}
            </dd>
          </div>
        </dl>
      </section>

      {/* --- K.O. + Ablehnungsgruende ------------------------------------ */}
      <section>
        <h2 className="font-serif text-2xl italic">{t.koTitel}</h2>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          {de ? (
            <>
              K.O.-Kriterien sind harte Formal-Checks <em>vor</em> der
              Bewertung: Fehlt ein Pflichtdokument, gibt es weder Score noch
              LLM-Einschätzung, nur einen Verlaufs-Eintrag mit dem Grund.
              Aktuell konfigurierbar:
            </>
          ) : (
            <>
              Knock-out criteria are hard formal checks <em>before</em> the
              evaluation: if a required document is missing, there is neither
              a score nor an LLM assessment, only a history entry with the
              reason. Currently configurable:
            </>
          )}
        </p>
        <ul className="mt-3 space-y-1.5">
          {Object.values(labels.ko).map((label) => (
            <li key={label} className="flex items-center gap-2 text-sm">
              <span className="rounded-full bg-rot-soft px-2 py-px text-[10px] font-medium text-rot">
                K.O.
              </span>
              {label}
            </li>
          ))}
        </ul>
        <p className="mt-5 text-sm leading-relaxed text-ink-soft">
          {de ? (
            <>
              Inhaltliche Schwächen erfasst das LLM dagegen als feste
              Kategorien (kein Freitext), damit man im Verlauf filtern und
              zählen kann, woran Bewerbungen scheitern:
            </>
          ) : (
            <>
              Content weaknesses, on the other hand, are captured by the LLM
              as fixed categories (no free text), so the history can be
              filtered and counted by what applications fail on:
            </>
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Object.values(labels.gruende).map((label) => (
            <span
              key={label}
              className="rounded-full bg-rot-soft px-2.5 py-0.5 text-xs text-rot"
            >
              {label}
            </span>
          ))}
        </div>
      </section>

      {/* --- Stack & Grenzen --------------------------------------------- */}
      <section>
        <h2 className="font-serif text-2xl italic">{t.stackTitel}</h2>
        <dl className="mt-4 space-y-3 text-sm leading-relaxed">
          <div>
            <dt className="font-medium">{t.stack}</dt>
            <dd className="text-ink-soft">
              {de ? (
                <>
                  LangChain (LCEL) + Gemini · FastAPI (
                  <code className="text-xs">api/</code>) · Next.js + Tailwind
                  (<code className="text-xs">web/</code>) · SQLite (
                  <code className="text-xs">data/ergebnisse.db</code>).
                  Uploads liegen unter{" "}
                  <code className="text-xs">data/uploads/</code>, Testdaten
                  erzeugt{" "}
                  <code className="text-xs">
                    scripts/generate_test_cvs.py
                  </code>
                  .
                </>
              ) : (
                <>
                  LangChain (LCEL) + Gemini · FastAPI (
                  <code className="text-xs">api/</code>) · Next.js + Tailwind
                  (<code className="text-xs">web/</code>) · SQLite (
                  <code className="text-xs">data/ergebnisse.db</code>).
                  Uploads live under{" "}
                  <code className="text-xs">data/uploads/</code>, test data
                  is generated by{" "}
                  <code className="text-xs">
                    scripts/generate_test_cvs.py
                  </code>
                  .
                </>
              )}
            </dd>
          </div>
          <div>
            <dt className="font-medium">{t.grenzen}</dt>
            <dd className="text-ink-soft">
              {de ? (
                <>
                  Kein OCR für gescannte PDFs. Anonymisierung entfernt
                  direkte Merkmale, aber keine indirekten Proxys (Stadtteile,
                  Vereinsnamen). Der EU AI Act stuft Bewerber-Screening als
                  Hochrisiko-System ein; dieses Projekt ist eine
                  Studienarbeit, kein Produktivsystem, und ersetzt keine
                  HR-Entscheidung.
                </>
              ) : (
                <>
                  No OCR for scanned PDFs. Anonymization removes direct
                  attributes but no indirect proxies (neighbourhoods, club
                  names). The EU AI Act classifies applicant screening as a
                  high-risk system; this project is a student project, not a
                  production system, and does not replace any HR decision.
                </>
              )}
            </dd>
          </div>
          <div>
            <dt className="font-medium">{t.nachvollziehen}</dt>
            <dd className="text-ink-soft">
              <code className="text-xs">
                python scripts/screen_cli.py data/test_cvs/* --ko-motivationsschreiben
              </code>{" "}
              {de ? (
                <>
                  fährt das komplette Screening über die Testdaten, inklusive
                  eines Kandidaten, der absichtlich am K.O. scheitert, und
                  eines Sammel-PDFs für den Bulk-Upload.
                </>
              ) : (
                <>
                  runs the complete screening over the test data, including a
                  candidate who deliberately fails the knock-out and a
                  combined PDF for the bulk upload.
                </>
              )}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
