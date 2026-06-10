"use client";

import { useEffect, useState } from "react";
import { fetchErgebnisse } from "@/lib/api";
import type { Labels, VerlaufEintrag } from "@/lib/types";
import BewertungDetails from "./BewertungDetails";
import { EmpfehlungChip, formatScore } from "./ui";

export default function GenehmigtTab({ labels }: { labels: Labels }) {
  const [eintraege, setEintraege] = useState<VerlaufEintrag[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [offen, setOffen] = useState<number | null>(null);

  useEffect(() => {
    fetchErgebnisse()
      .then(setEintraege)
      .catch((e) => setFehler(e.message));
  }, []);

  if (fehler) return <p className="text-sm text-rot">{fehler}</p>;
  if (!eintraege) return <p className="text-sm text-ink-faint">Lade…</p>;

  const genehmigte = eintraege
    .filter((e) => e.status === "genehmigt" && e.gesamt_score !== null)
    .sort((a, b) => (b.gesamt_score ?? 0) - (a.gesamt_score ?? 0));

  if (genehmigte.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="font-serif text-2xl italic text-ink-faint">
          Noch niemand im Rennen.
        </p>
        <p className="mt-2 text-sm text-ink-faint">
          Genehmigte Bewerbungen erscheinen hier sortiert nach Score —
          die beste zuerst.
        </p>
      </div>
    );
  }

  return (
    <section>
      <p className="mb-2 text-sm text-ink-faint">
        {genehmigte.length}{" "}
        {genehmigte.length === 1 ? "Kandidat:in" : "Kandidat:innen"} im Rennen,
        sortiert nach Gesamt-Score
      </p>
      <ol>
        {genehmigte.map((e, i) => (
          <li key={e.id} className="rise-in border-b border-line">
            <button
              onClick={() => setOffen(offen === e.id ? null : e.id)}
              className="grid w-full grid-cols-[2.5rem_1fr_auto_auto] items-center gap-4 py-4 text-left transition-colors hover:bg-surface"
              aria-expanded={offen === e.id}
            >
              <span className="font-serif text-2xl text-ink-faint">
                {i + 1}
              </span>
              <span>
                <span className="block font-medium">{e.kandidat}</span>
                <span className="block text-xs text-ink-faint">
                  {e.stelle_titel} ·{" "}
                  {e.dokumente.length === 1
                    ? "1 Dokument"
                    : `${e.dokumente.length} Dokumente`}
                </span>
              </span>
              {e.empfehlung && <EmpfehlungChip empfehlung={e.empfehlung} />}
              <span className="font-serif text-4xl">
                {formatScore(e.gesamt_score!)}
                <span className="ml-1 text-sm text-ink-faint">/100</span>
              </span>
            </button>
            <div
              className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                offen === e.id ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                {e.bewertung && (
                  <div className="pl-[3.5rem]">
                    <BewertungDetails
                      bewertung={e.bewertung}
                      labels={labels}
                      korrigiert={e.korrigiert}
                    />
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
