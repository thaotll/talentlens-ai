"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useSprache } from "@/lib/i18n";

const T = {
  de: {
    titel: "Stellenausschreibung",
    fertig: "Fertig - Leseansicht zeigen",
    bearbeiten: "Bearbeiten",
    intro:
      "Gegen diese Anforderungen werden alle Bewerbungen bewertet. Änderungen gelten sofort für die nächste Analyse und bleiben lokal im Browser gespeichert.",
    platzhalter: "Stellenausschreibung hier einfügen…",
    markdownHinweis: "Markdown wird unterstützt:",
    leerTitel: "Noch keine Stellenausschreibung hinterlegt.",
    leerText: "Ohne sie kann keine Analyse gestartet werden.",
    einfuegen: "Ausschreibung einfügen",
    koTitel: "K.O.-Kriterien",
    koText:
      "Wird ein Pflichtdokument nicht erkannt, wird die Bewerbung ohne LLM-Bewertung direkt abgelehnt.",
    lebenslaufPflicht: "Lebenslauf erforderlich",
    motivationPflicht: "Motivationsschreiben erforderlich",
  },
  en: {
    titel: "Job posting",
    fertig: "Done - show reading view",
    bearbeiten: "Edit",
    intro:
      "All applications are evaluated against these requirements. Changes apply immediately to the next analysis and are stored locally in the browser.",
    platzhalter: "Paste the job posting here…",
    markdownHinweis: "Markdown is supported:",
    leerTitel: "No job posting yet.",
    leerText: "Without one, no analysis can be started.",
    einfuegen: "Add job posting",
    koTitel: "Knock-out criteria",
    koText:
      "If a required document is not detected, the application is rejected immediately without an LLM evaluation.",
    lebenslaufPflicht: "CV required",
    motivationPflicht: "Cover letter required",
  },
} as const;

/** Anforderungskonfiguration: Stellenausschreibung + K.O.-Kriterien.
 *  Standardmaessig eine gerenderte Leseansicht (praesentationstauglich);
 *  der rohe Markdown-Text ist nur im Bearbeiten-Modus sichtbar. */
export default function AnforderungenTab({
  stelle,
  setStelle,
  lebenslaufPflicht,
  setLebenslaufPflicht,
  motivationPflicht,
  setMotivationPflicht,
}: {
  stelle: string;
  setStelle: (s: string) => void;
  lebenslaufPflicht: boolean;
  setLebenslaufPflicht: (v: boolean) => void;
  motivationPflicht: boolean;
  setMotivationPflicht: (v: boolean) => void;
}) {
  const { sprache } = useSprache();
  const t = T[sprache];
  const [bearbeiten, setBearbeiten] = useState(false);

  return (
    <div className="mx-auto max-w-3xl space-y-12">
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 className="font-serif text-2xl italic">{t.titel}</h2>
          {stelle.trim() && (
            <button
              onClick={() => setBearbeiten(!bearbeiten)}
              className="text-xs font-medium text-tanne transition-colors hover:text-tanne-deep"
            >
              {bearbeiten ? t.fertig : t.bearbeiten}
            </button>
          )}
        </div>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-faint">
          {t.intro}
        </p>

        {bearbeiten ? (
          <>
            <textarea
              value={stelle}
              onChange={(e) => setStelle(e.target.value)}
              rows={22}
              autoFocus
              placeholder={t.platzhalter}
              className="mt-4 w-full resize-y rounded-xl border border-line bg-surface p-4 text-sm leading-relaxed text-ink outline-none focus:border-tanne"
            />
            <p className="mt-2 text-xs text-ink-faint">
              {t.markdownHinweis} <code># {sprache === "de" ? "Titel" : "Title"}</code>,{" "}
              <code>## {sprache === "de" ? "Abschnitt" : "Section"}</code>,{" "}
              <code>- {sprache === "de" ? "Aufzählung" : "List item"}</code>,{" "}
              <code>**{sprache === "de" ? "fett" : "bold"}**</code>{" "}
              {sprache === "de" ? "und Tabellen (" : "and tables ("}
              <code>| {sprache === "de" ? "Spalte | Spalte" : "Column | Column"} |</code>).
            </p>
          </>
        ) : stelle.trim() ? (
          <div className="mt-4 rounded-xl border border-line bg-surface px-6 py-7 sm:px-8">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h3 className="font-serif text-2xl italic text-ink">
                    {children}
                  </h3>
                ),
                h2: ({ children }) => (
                  <h4 className="mt-7 mb-2 text-xs font-medium tracking-wide text-tanne-deep uppercase first:mt-0">
                    {children}
                  </h4>
                ),
                h3: ({ children }) => (
                  <h5 className="mt-5 mb-1.5 text-sm font-medium text-ink">
                    {children}
                  </h5>
                ),
                p: ({ children }) => (
                  <p className="my-2 max-w-prose text-sm leading-relaxed text-ink-soft">
                    {children}
                  </p>
                ),
                ul: ({ children }) => (
                  <ul className="my-2 max-w-prose list-disc space-y-1.5 pl-5 marker:text-tanne">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="my-2 max-w-prose list-decimal space-y-1.5 pl-5 marker:text-tanne">
                    {children}
                  </ol>
                ),
                li: ({ children }) => (
                  <li className="text-sm leading-relaxed text-ink-soft">
                    {children}
                  </li>
                ),
                strong: ({ children }) => (
                  <strong className="font-medium text-ink">{children}</strong>
                ),
                a: ({ children, href }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-tanne underline decoration-line-strong underline-offset-2 hover:decoration-tanne"
                  >
                    {children}
                  </a>
                ),
                code: ({ children }) => (
                  <code className="rounded bg-tanne-soft px-1 py-0.5 text-xs">
                    {children}
                  </code>
                ),
                table: ({ children }) => (
                  <div className="my-4 overflow-x-auto">
                    <table className="w-full border-collapse">{children}</table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="border-b border-line-strong px-3 py-2 text-left text-xs font-medium tracking-wide text-tanne-deep uppercase">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="border-b border-line px-3 py-2 align-top text-sm leading-relaxed text-ink-soft">
                    {children}
                  </td>
                ),
              }}
            >
              {stelle}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
            <p className="font-serif text-xl italic text-ink-faint">
              {t.leerTitel}
            </p>
            <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-faint">
              {t.leerText}
            </p>
            <button
              onClick={() => setBearbeiten(true)}
              className="mt-5 rounded-lg bg-tanne px-5 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-tanne-deep"
            >
              {t.einfuegen}
            </button>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-base font-medium">{t.koTitel}</h2>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-faint">
          {t.koText}
        </p>
        <div className="mt-4 space-y-2.5">
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={lebenslaufPflicht}
              onChange={(e) => setLebenslaufPflicht(e.target.checked)}
              className="mt-0.5 size-4 accent-tanne"
            />
            {t.lebenslaufPflicht}
          </label>
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={motivationPflicht}
              onChange={(e) => setMotivationPflicht(e.target.checked)}
              className="mt-0.5 size-4 accent-tanne"
            />
            {t.motivationPflicht}
          </label>
        </div>
      </section>
    </div>
  );
}
