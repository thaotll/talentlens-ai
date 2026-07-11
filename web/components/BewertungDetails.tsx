"use client";

import { useSprache } from "@/lib/i18n";
import type { Bewertung, Labels } from "@/lib/types";
import { ScoreBar } from "./ui";

const T = {
  de: {
    korrigiert:
      "Die Selbstkritik der Pipeline hat die erste Bewertung beanstandet - dies ist die korrigierte Fassung.",
    zitatAuf: "„",
    zitatZu: "“",
  },
  en: {
    korrigiert:
      "The pipeline's self-critique flagged the first evaluation - this is the corrected version.",
    zitatAuf: "“",
    zitatZu: "”",
  },
} as const;

export default function BewertungDetails({
  bewertung,
  labels,
  korrigiert,
}: {
  bewertung: Bewertung;
  labels: Labels;
  korrigiert: boolean;
}) {
  const { sprache } = useSprache();
  const t = T[sprache];
  return (
    <div className="space-y-6 py-5">
      <p className="max-w-prose text-sm leading-relaxed text-ink-soft">
        {bewertung.zusammenfassung}
      </p>

      {(bewertung.staerken.length > 0 ||
        bewertung.ablehnungsgruende.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {bewertung.staerken.map((s) => (
            <span
              key={s}
              className="rounded-full bg-tanne-soft px-2.5 py-0.5 text-xs text-tanne-deep"
            >
              {s}
            </span>
          ))}
          {bewertung.ablehnungsgruende.map((g) => (
            <span
              key={g}
              className="rounded-full bg-rot-soft px-2.5 py-0.5 text-xs text-rot"
            >
              {labels.gruende[g] ?? g}
            </span>
          ))}
        </div>
      )}

      <dl className="space-y-5">
        {bewertung.kriterien.map((k) => (
          <div key={k.kriterium}>
            <dt className="flex items-baseline justify-between gap-4">
              <span className="text-sm font-medium">
                {labels.kriterien[k.kriterium] ?? k.kriterium}
              </span>
              <span className="font-serif text-lg text-ink">
                {k.score}
                <span className="text-sm text-ink-faint">/10</span>
              </span>
            </dt>
            <div className="mt-1.5 mb-2">
              <ScoreBar score={k.score} />
            </div>
            <dd className="max-w-prose text-sm leading-relaxed text-ink-soft">
              {k.begruendung}
              {k.belege.length > 0 && (
                <ul className="mt-2 space-y-1 border-l border-line-strong pl-3">
                  {k.belege.map((b) => (
                    <li key={b} className="text-xs italic text-ink-faint">
                      {t.zitatAuf}
                      {b}
                      {t.zitatZu}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {korrigiert && (
        <p className="text-xs text-ink-faint">{t.korrigiert}</p>
      )}
    </div>
  );
}
