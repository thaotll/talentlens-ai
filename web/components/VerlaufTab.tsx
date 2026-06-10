"use client";

import { useEffect, useState } from "react";
import { fetchErgebnisse, loescheVerlauf } from "@/lib/api";
import type { Labels, VerlaufEintrag } from "@/lib/types";
import BewertungDetails from "./BewertungDetails";
import { formatScore, StatusChip } from "./ui";

function formatZeit(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function VerlaufTab({ labels }: { labels: Labels }) {
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

  if (eintraege.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="font-serif text-2xl italic text-ink-faint">
          Der Verlauf ist leer.
        </p>
        <p className="mt-2 text-sm text-ink-faint">
          Hier landet jede Bewertung — auch abgelehnte, mit Begründung.
        </p>
      </div>
    );
  }

  const begruendung = (e: VerlaufEintrag): string => {
    if (e.ko_grund) return labels.ko[e.ko_grund] ?? e.ko_grund;
    if (e.status === "abgelehnt" && e.bewertung?.ablehnungsgruende.length)
      return e.bewertung.ablehnungsgruende
        .map((g) => labels.gruende[g] ?? g)
        .join(", ");
    return "";
  };

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm text-ink-faint">
          {eintraege.length}{" "}
          {eintraege.length === 1 ? "Bewertung" : "Bewertungen"}, neueste zuerst
        </p>
        <button
          onClick={async () => {
            if (!window.confirm("Gesamten Verlauf unwiderruflich löschen?"))
              return;
            await loescheVerlauf();
            setEintraege([]);
          }}
          className="text-xs text-ink-faint transition-colors hover:text-rot"
        >
          Verlauf leeren
        </button>
      </div>

      <ol>
        {eintraege.map((e) => (
          <li key={e.id} className="rise-in border-b border-line">
            <button
              onClick={() =>
                e.bewertung && setOffen(offen === e.id ? null : e.id)
              }
              className={`grid w-full grid-cols-[5.5rem_1fr_auto_4rem] items-baseline gap-4 py-3.5 text-left transition-colors ${
                e.bewertung ? "hover:bg-surface" : "cursor-default"
              }`}
              aria-expanded={offen === e.id}
            >
              <span className="text-xs text-ink-faint">
                {formatZeit(e.zeitstempel)}
              </span>
              <span className="min-w-0">
                <span className="font-medium">{e.kandidat}</span>
                <span className="ml-2 text-xs text-ink-faint">
                  {e.stelle_titel}
                </span>
                {begruendung(e) && (
                  <span className="block truncate text-xs text-rot">
                    {begruendung(e)}
                  </span>
                )}
              </span>
              <StatusChip status={e.status} ko={e.ko_grund !== null} />
              <span className="text-right font-serif text-xl">
                {e.gesamt_score !== null ? formatScore(e.gesamt_score) : "—"}
              </span>
            </button>
            <div
              className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                offen === e.id ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                {e.bewertung && (
                  <div className="pl-[6.5rem]">
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
