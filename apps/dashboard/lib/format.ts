export function fmtUsd(n: number | null | undefined, opts?: { sign?: boolean }): string {
  if (n == null) return "—";
  const sign = opts?.sign && n > 0 ? "+" : "";
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? "-" : sign}$${formatted}`;
}

export function fmtRelativeTime(epochMs: number): string {
  const diff = Date.now() - epochMs;
  if (diff < 60_000) return `${Math.max(0, Math.floor(diff / 1000))}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtRoas(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(2)}×`;
}

export function statusColor(status: string): string {
  switch (status) {
    case "keep":
      return "#0a7d33";
    case "discard":
      return "#9e1d1d";
    case "refine":
      return "#a86700";
    case "crash":
      return "#5b1f6b";
    case "pending":
    default:
      return "#666";
  }
}
