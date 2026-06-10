export function formatScore(score: number): string {
  return score.toLocaleString("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function StatusChip({
  status,
  ko,
}: {
  status: "genehmigt" | "abgelehnt";
  ko?: boolean;
}) {
  if (status === "genehmigt") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-tanne-soft px-2.5 py-0.5 text-xs font-medium text-tanne-deep">
        <span className="size-1.5 rounded-full bg-tanne" />
        Genehmigt
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-rot-soft px-2.5 py-0.5 text-xs font-medium text-rot">
      <span className="size-1.5 rounded-full bg-rot" />
      {ko ? "K.O." : "Abgelehnt"}
    </span>
  );
}

export function EmpfehlungChip({ empfehlung }: { empfehlung: string }) {
  const stil =
    empfehlung === "Einladen"
      ? "bg-tanne-soft text-tanne-deep"
      : empfehlung === "Pruefen"
        ? "bg-gold-soft text-gold"
        : "bg-rot-soft text-rot";
  const label = empfehlung === "Pruefen" ? "Prüfen" : empfehlung;
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${stil}`}>
      {label}
    </span>
  );
}

export function ScoreBar({ score }: { score: number }) {
  const farbe = score >= 7 ? "bg-tanne" : score >= 5 ? "bg-gold" : "bg-rot";
  return (
    <div className="h-0.5 w-full rounded-full bg-line">
      <div
        className={`h-0.5 rounded-full ${farbe}`}
        style={{ width: `${score * 10}%` }}
      />
    </div>
  );
}

export function Spinner() {
  return (
    <span
      className="inline-block size-3.5 animate-spin rounded-full border-[1.5px] border-line-strong border-t-tanne"
      aria-label="Wird bewertet"
    />
  );
}
