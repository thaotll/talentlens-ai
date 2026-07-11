"use client";

import { useEffect, useState } from "react";
import { fetchErgebnisse, loescheVerlauf } from "@/lib/api";
import { LOCALES, useSprache, type Sprache } from "@/lib/i18n";
import type { Labels, VerlaufEintrag } from "@/lib/types";
import BewertungDetails from "./BewertungDetails";
import { formatScore, StatusChip } from "./ui";

const T = {
  de: {
    laden: "Lade…",
    leerTitel: "Der Verlauf ist leer.",
    leerText: "Hier erscheinen alle Bewertungen, auch abgelehnte mit Begründung.",
    anzahl: (n: number) =>
      `${n} ${n === 1 ? "Bewertung" : "Bewertungen"}, neueste zuerst`,
    leeren: "Verlauf leeren",
    leerenBestaetigen: "Gesamten Verlauf unwiderruflich löschen?",
  },
  en: {
    laden: "Loading…",
    leerTitel: "The history is empty.",
    leerText: "All evaluations appear here, including rejections with reasons.",
    anzahl: (n: number) =>
      `${n} ${n === 1 ? "evaluation" : "evaluations"}, newest first`,
    leeren: "Clear history",
    leerenBestaetigen: "Permanently delete the entire history?",
  },
} as const;

function formatZeit(iso: string, sprache: Sprache): string {
  const d = new Date(iso);
  return d.toLocaleString(LOCALES[sprache], {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function VerlaufTab({
  labels,
  aktiv,
}: {
  labels: Labels;
  aktiv: boolean;
}) {
  const { sprache } = useSprache();
  const t = T[sprache];
  const [eintraege, setEintraege] = useState<VerlaufEintrag[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [offen, setOffen] = useState<number | null>(null);

  // Der Tab bleibt dauerhaft gemountet (nur versteckt) - deshalb bei jedem
  // Aktivieren neu laden, damit frisch analysierte Bewerbungen erscheinen.
  useEffect(() => {
    if (!aktiv) return;
    fetchErgebnisse()
      .then(setEintraege)
      .catch((e) => setFehler(e.message));
  }, [aktiv]);

  if (fehler) return <p className="text-sm text-rot">{fehler}</p>;
  if (!eintraege) return <p className="text-sm text-ink-faint">{t.laden}</p>;

  if (eintraege.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="font-serif text-2xl italic text-ink-faint">
          {t.leerTitel}
        </p>
        <p className="mt-2 text-sm text-ink-faint">{t.leerText}</p>
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
        <p className="text-sm text-ink-faint">{t.anzahl(eintraege.length)}</p>
        <button
          onClick={async () => {
            if (!window.confirm(t.leerenBestaetigen)) return;
            await loescheVerlauf();
            setEintraege([]);
          }}
          className="text-xs text-ink-faint transition-colors hover:text-rot"
        >
          {t.leeren}
        </button>
      </div>

      <ol>
        {eintraege.map((e) => (
          <li key={e.id} className="rise-in border-b border-line">
            <button
              onClick={() =>
                e.bewertung && setOffen(offen === e.id ? null : e.id)
              }
              className={`grid w-full grid-cols-[5.5rem_1fr_auto_5.5rem] items-baseline gap-4 py-3.5 text-left transition-colors ${
                e.bewertung ? "hover:bg-surface" : "cursor-default"
              }`}
              aria-expanded={offen === e.id}
            >
              <span className="text-xs text-ink-faint">
                {formatZeit(e.zeitstempel, sprache)}
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
              <StatusChip
                status={e.status}
                ko={e.ko_grund !== null}
                empfehlung={e.empfehlung}
              />
              <span className="text-right font-serif text-xl">
                {e.gesamt_score !== null ? (
                  <>
                    {formatScore(e.gesamt_score, sprache)}
                    <span className="text-xs text-ink-faint">/100</span>
                  </>
                ) : (
                  "–"
                )}
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
