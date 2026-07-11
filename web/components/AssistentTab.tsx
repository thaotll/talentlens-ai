"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, frageAssistent } from "@/lib/api";
import { useSprache } from "@/lib/i18n";
import type { ChatNachricht } from "@/lib/types";
import { Spinner } from "./ui";

/** HR-Assistent: Chat mit dem Tool-Calling-Agenten (core/agent.py).
 *  Anders als das Screening (feste Pipeline) entscheidet hier das LLM
 *  selbst, welche Werkzeuge es aufruft - die Aufrufe werden pro Antwort
 *  eingeblendet, damit die Agent-Schritte nachvollziehbar sind. */

const T = {
  de: {
    beispielFragen: [
      "Wer sind die besten Kandidaten und warum?",
      "Warum ist Ben Keller rausgeflogen?",
      "Vergleiche Anna Schmidt und David Okafor bei den Skills.",
      "Woran scheitern die meisten Bewerbungen?",
    ],
    introVor: "Freie Fragen zu den Screening-Ergebnissen. Hier arbeitet ein ",
    introAgent: "Agent",
    introNach:
      ": Das LLM entscheidet selbst, welche Werkzeuge (Ergebnisliste, Bewertungen, Vergleich, Statistik, Ausschreibung) es aufruft - die Schritte werden unter jeder Antwort angezeigt.",
    chatLeeren: "Chat leeren",
    zumAusprobieren: "Zum Ausprobieren",
    agentArbeitet:
      "Der Agent arbeitet - ruft Werkzeuge auf und formuliert die Antwort …",
    apiWeg: "API nicht erreichbar - läuft das Backend?",
    platzhalter: "Frage zu den Ergebnissen stellen …",
    eingabeAria: "Frage an den Assistenten",
    fragen: "Fragen",
    hinweis:
      "Antworten stützen sich auf die gespeicherten Bewertungen - Scores bleiben LLM-Schätzungen, die Entscheidung trifft ein Mensch.",
  },
  en: {
    beispielFragen: [
      "Who are the best candidates and why?",
      "Why was Ben Keller rejected?",
      "Compare Anna Schmidt and David Okafor on skills.",
      "What do most applications fail on?",
    ],
    introVor: "Ask free-form questions about the screening results. This is an ",
    introAgent: "agent",
    introNach:
      ": the LLM decides on its own which tools (result list, evaluations, comparison, statistics, job posting) to call - the steps are shown below each answer.",
    chatLeeren: "Clear chat",
    zumAusprobieren: "Try it out",
    agentArbeitet:
      "The agent is working - calling tools and writing the answer …",
    apiWeg: "API not reachable - is the backend running?",
    platzhalter: "Ask a question about the results …",
    eingabeAria: "Question for the assistant",
    fragen: "Ask",
    hinweis:
      "Answers are based on the stored evaluations - scores remain LLM estimates, the decision is made by a human.",
  },
} as const;

export default function AssistentTab({ stelle }: { stelle: string }) {
  const { sprache } = useSprache();
  const t = T[sprache];
  const [nachrichten, setNachrichten] = useState<ChatNachricht[]>([]);
  const [eingabe, setEingabe] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const endeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [nachrichten, laeuft]);

  async function fragen(frage: string) {
    const text = frage.trim();
    if (!text || laeuft) return;
    setFehler(null);
    setEingabe("");
    // Verlauf VOR dem Anfuegen der neuen Frage einfrieren - die Frage
    // selbst geht separat als `frage` mit.
    const verlauf = nachrichten.map(({ rolle, text }) => ({ rolle, text }));
    setNachrichten((n) => [...n, { rolle: "nutzer", text }]);
    setLaeuft(true);
    try {
      const antwort = await frageAssistent(text, verlauf, stelle, sprache);
      setNachrichten((n) => [
        ...n,
        {
          rolle: "assistent",
          text: antwort.antwort,
          toolAufrufe: antwort.tool_aufrufe,
        },
      ]);
    } catch (e) {
      setFehler(e instanceof ApiError ? e.message : t.apiWeg);
    }
    setLaeuft(false);
  }

  function absenden(e: FormEvent) {
    e.preventDefault();
    fragen(eingabe);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-sm leading-relaxed text-ink-soft">
          {t.introVor}
          <strong className="font-medium text-ink">{t.introAgent}</strong>
          {t.introNach}
        </p>
        {nachrichten.length > 0 && (
          <button
            onClick={() => {
              setNachrichten([]);
              setFehler(null);
            }}
            className="shrink-0 text-xs text-ink-faint transition-colors hover:text-ink"
          >
            {t.chatLeeren}
          </button>
        )}
      </div>

      <div className="mt-8 space-y-6">
        {nachrichten.length === 0 && !laeuft && (
          <div className="rounded-xl border border-line bg-surface p-5">
            <p className="text-xs tracking-wide text-ink-faint uppercase">
              {t.zumAusprobieren}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {t.beispielFragen.map((frage) => (
                <button
                  key={frage}
                  onClick={() => fragen(frage)}
                  className="rounded-full border border-line px-3 py-1.5 text-left text-xs text-ink-soft transition-colors hover:border-tanne hover:text-ink"
                >
                  {frage}
                </button>
              ))}
            </div>
          </div>
        )}

        {nachrichten.map((nachricht, i) =>
          nachricht.rolle === "nutzer" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[85%] rounded-xl rounded-br-sm bg-tanne-soft px-4 py-2.5 text-sm leading-relaxed text-tanne-deep">
                {nachricht.text}
              </p>
            </div>
          ) : (
            <div key={i} className="max-w-[85%]">
              {nachricht.toolAufrufe && nachricht.toolAufrufe.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {nachricht.toolAufrufe.map((aufruf, j) => (
                    <span
                      key={j}
                      title={JSON.stringify(aufruf.args)}
                      className="rounded-full bg-gold-soft px-2.5 py-0.5 font-mono text-[10px] text-gold"
                    >
                      🔧 {aufruf.tool}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink">
                {nachricht.text}
              </p>
            </div>
          ),
        )}

        {laeuft && (
          <p className="flex items-center gap-2.5 text-sm text-ink-faint">
            <Spinner /> {t.agentArbeitet}
          </p>
        )}
        {fehler && (
          <div className="rounded-lg bg-rot-soft px-4 py-3 text-sm text-rot">
            {fehler}
          </div>
        )}
        <div ref={endeRef} />
      </div>

      <form onSubmit={absenden} className="sticky bottom-0 mt-8 bg-canvas pb-4">
        <div className="flex gap-2">
          <input
            value={eingabe}
            onChange={(e) => setEingabe(e.target.value)}
            placeholder={t.platzhalter}
            aria-label={t.eingabeAria}
            className="w-full rounded-lg border border-line bg-surface px-4 py-2.5 text-sm outline-none focus:border-tanne"
          />
          <button
            type="submit"
            disabled={laeuft || !eingabe.trim()}
            className="shrink-0 rounded-lg bg-tanne px-5 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-tanne-deep disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t.fragen}
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-faint">{t.hinweis}</p>
      </form>
    </div>
  );
}
