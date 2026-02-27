// components/summary-box.tsx
import type { CategorySummary } from "@/lib/summary"

function fmt(price?: number): string {
  if (price === undefined) return ""
  return price >= 1000
    ? `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
    : `$${price.toFixed(2)}`
}

function fmtChange(change?: number): string {
  if (change === undefined) return ""
  const sign = change >= 0 ? "+" : ""
  return `${sign}${change}%`
}

export function SummaryBox({ summary }: { summary: CategorySummary }) {
  if (summary.completedCount === 0) return null

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3">
      {/* Overview */}
      <p className="text-sm leading-relaxed text-foreground/80">{summary.overviewText}</p>

      {/* Tickers */}
      {summary.tickers.length > 0 && (
        <div className="space-y-1.5">
          {summary.tickers.map((t) => (
            <div key={t.ticker} className="flex items-baseline gap-2 font-mono text-xs">
              <span className="text-foreground w-12 shrink-0">{t.ticker}</span>
              {t.resolved && (
                <span className="text-foreground/60 w-20 shrink-0">{fmt(t.price)}</span>
              )}
              {t.resolved && t.change !== undefined && (
                <span className={`w-14 shrink-0 ${t.change >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {fmtChange(t.change)}
                </span>
              )}
              <span className="text-muted-foreground">— {t.sentimentLabel}</span>
            </div>
          ))}
        </div>
      )}

      {/* Highlights */}
      {summary.highlights.length > 0 && (
        <div className="space-y-1 pt-2 border-t border-border/50">
          {summary.highlights.map((h) => (
            <p key={h.handle} className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-mono text-foreground/60">@{h.handle}</span>
              {" — "}{h.text}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
