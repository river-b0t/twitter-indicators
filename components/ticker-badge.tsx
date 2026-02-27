// components/ticker-badge.tsx
import { Badge } from "@/components/ui/badge"
import type { TickerEntry } from "@/lib/finnhub"

interface TickerBadgeProps {
  ticker: string
  entry?: TickerEntry
}

function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
  if (price >= 1) return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
}

export function TickerBadge({ ticker, entry }: TickerBadgeProps) {
  // No price data — plain badge
  if (!entry) {
    return <Badge variant="outline" className="text-xs">{ticker}</Badge>
  }

  // Unresolved — show with ? indicator
  if (!entry.resolved) {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        {ticker} ?
      </Badge>
    )
  }

  // Resolved — show price and % change
  const changePositive = (entry.change ?? 0) >= 0
  const changeColor = changePositive ? "text-green-600" : "text-red-600"
  const changePrefix = changePositive ? "+" : ""

  return (
    <Badge variant="outline" className="text-xs gap-1">
      <span>{ticker}</span>
      {entry.price !== undefined && (
        <span className="text-muted-foreground">{formatPrice(entry.price)}</span>
      )}
      {entry.change !== undefined && (
        <span className={changeColor}>
          ({changePrefix}{entry.change}%)
        </span>
      )}
    </Badge>
  )
}
