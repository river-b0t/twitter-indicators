// components/DailySummaryPanel.tsx
import { prisma } from "@/lib/prisma"
import { format } from "date-fns"
import Link from "next/link"
import type { CategorySummaryContent, GlobalSummaryContent, TickerConsensus } from "@/lib/summarizer"

const CATEGORIES = ["traders", "crypto", "onchain", "vc", "tradfi", "thematic", "builders"] as const
const DISPLAY: Record<string, string> = {
  traders: "Traders", crypto: "Crypto", onchain: "Onchain",
  vc: "VC", tradfi: "TradFi", thematic: "Thematic", builders: "Builders",
}

function fmtMentions(n: number) {
  return `${n} ref${n === 1 ? "" : "s"}`
}

function TickerRow({ t, dateStr }: { t: TickerConsensus; dateStr: string }) {
  const contrarianHandle = t.contrarian ? /@(\w+)/.exec(t.contrarian)?.[1] : null

  return (
    <div className="py-1.5 border-b border-border/40 last:border-0">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs text-foreground w-14 shrink-0">{t.ticker}</span>
        <span className="text-xs text-muted-foreground w-16 shrink-0">{fmtMentions(t.weightedMentions)}</span>
        <span className="text-xs text-foreground/80 leading-relaxed">{t.consensus}</span>
      </div>
      {t.contrarian && (
        <p className="text-xs text-amber-400/80 ml-[7.5rem] mt-0.5 leading-relaxed">
          {"⚠ "}{t.contrarian}
          {contrarianHandle && (
            <Link
              href={`/digest/${contrarianHandle}?date=${dateStr}`}
              className="ml-2 font-mono text-[10px] text-amber-400 hover:text-amber-300 underline underline-offset-2"
            >
              view →
            </Link>
          )}
        </p>
      )}
    </div>
  )
}

interface Props {
  date: Date
  activeCategoryFilter: string
}

export async function DailySummaryPanel({ date, activeCategoryFilter }: Props) {
  const dateStr = format(date, "yyyy-MM-dd")
  const summaries = await prisma.dailySummary.findMany({
    where: { date },
  })

  if (summaries.length === 0) return null

  const globalRow = summaries.find((s) => s.scope === "global")
  const categoryRows = CATEGORIES
    .map((cat) => ({ cat, row: summaries.find((s) => s.scope === cat) }))
    .filter((x) => x.row != null)

  if (!globalRow && categoryRows.length === 0) return null

  const global = globalRow?.content as GlobalSummaryContent | undefined
  const focusedCategory = activeCategoryFilter !== "all"
    ? categoryRows.find((x) => x.cat === activeCategoryFilter)
    : null

  return (
    <details open className="bg-card border border-border rounded-lg overflow-hidden">
      <summary className="px-4 py-3 cursor-pointer font-mono text-xs tracking-widest uppercase text-muted-foreground hover:text-foreground transition-colors select-none list-none flex items-center justify-between">
        <span>Market Overview</span>
        <span className="text-[10px]">▼</span>
      </summary>

      <div className="px-4 pb-4 space-y-4">
        {focusedCategory?.row && (
          <div className="space-y-2">
            <p className="font-mono text-xs tracking-widest uppercase text-muted-foreground">
              {DISPLAY[focusedCategory.cat]}
            </p>
            {(() => {
              const c = focusedCategory.row!.content as unknown as CategorySummaryContent
              return (
                <>
                  <p className="text-sm leading-relaxed text-foreground/80">{c.text}</p>
                  {c.tickers?.length > 0 && (
                    <div className="mt-2">
                      {c.tickers.map((t) => <TickerRow key={t.ticker} t={t} dateStr={dateStr} />)}
                    </div>
                  )}
                </>
              )
            })()}
          </div>
        )}

        {global && global.tickers.length > 0 && (
          <div className="space-y-1">
            <p className="font-mono text-xs tracking-widest uppercase text-muted-foreground">Top References</p>
            <div>
              {global.tickers.map((t) => <TickerRow key={t.ticker} t={t} dateStr={dateStr} />)}
            </div>
          </div>
        )}

        {activeCategoryFilter === "all" && categoryRows.length > 0 && (
          <div className="space-y-3">
            <p className="font-mono text-xs tracking-widest uppercase text-muted-foreground">By Category</p>
            <div className="flex flex-wrap gap-2">
              {categoryRows.map(({ cat, row }) => {
                const c = row!.content as unknown as CategorySummaryContent
                return (
                  <details key={cat} className="w-full">
                    <summary className="cursor-pointer text-xs font-mono uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors list-none">
                      ▶ {DISPLAY[cat]}
                    </summary>
                    <div className="mt-2 pl-3 border-l border-border/50 space-y-2">
                      <p className="text-sm leading-relaxed text-foreground/80">{c.text}</p>
                      {c.tickers?.length > 0 && (
                        <div>
                          {c.tickers.map((t) => <TickerRow key={t.ticker} t={t} dateStr={dateStr} />)}
                        </div>
                      )}
                    </div>
                  </details>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </details>
  )
}
