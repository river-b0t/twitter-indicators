import {
  Html, Head, Body, Container, Section, Text, Heading, Hr, Link
} from "@react-email/components"
import type { CategorySummaryContent } from "@/lib/summarizer"

interface AccountDigest {
  handle: string
  displayName: string
  categories: string[]
  tierMap?: Record<string, number>
  summary: string
  sentiment: string
  tickers: string[]
  tickerData?: Record<string, { price?: number; change?: number; resolved: boolean }>
}

interface DigestEmailProps {
  date: string
  digests: AccountDigest[]
  dashboardUrl: string
  summaries?: Array<{ scope: string; content: object }>
}

const CATEGORIES = ["traders", "crypto", "onchain", "vc", "tradfi", "thematic", "builders"]
const DISPLAY: Record<string, string> = {
  traders: "Traders", crypto: "Crypto", onchain: "Onchain",
  vc: "Crypto VC", tradfi: "TradFi", thematic: "Thematic", builders: "Builders",
}

const sentimentEmoji: Record<string, string> = {
  bullish: "📈", bearish: "📉", neutral: "➡️", mixed: "↕️",
}

function getTier(tierMap: Record<string, number> | undefined, category: string): number {
  return tierMap?.[category] ?? 99
}

function formatPrice(p: number): string {
  if (p >= 1000) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
  if (p >= 1) return `$${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return `$${p.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
}

export function DigestEmail({ date, digests, dashboardUrl, summaries }: DigestEmailProps) {
  // Filter out no-tweet accounts
  const activeDigests = digests.filter((d) => d.summary !== "No tweets today.")

  const sentimentCounts = activeDigests.reduce((acc, d) => {
    acc[d.sentiment] = (acc[d.sentiment] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  // Group by category, sorted by tier within each category
  const grouped = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = activeDigests
      .filter((d) => d.categories.includes(cat))
      .sort((a, b) => getTier(a.tierMap, cat) - getTier(b.tierMap, cat))
    return acc
  }, {} as Record<string, AccountDigest[]>)

  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#f9fafb", padding: "20px" }}>
        <Container style={{ maxWidth: "600px", margin: "0 auto", backgroundColor: "#fff", padding: "32px", borderRadius: "8px" }}>
          <Heading style={{ fontSize: "20px", marginBottom: "4px" }}>Timeline Digest</Heading>
          <Text style={{ color: "#6b7280", marginTop: "0" }}>{date}</Text>

          <Text style={{ fontSize: "14px" }}>
            {Object.entries(sentimentCounts).map(([s, n]) => `${sentimentEmoji[s] ?? ""} ${n} ${s}`).join(" · ")}
          </Text>

          <Hr />

          {CATEGORIES.map((cat) => {
            const catDigests = grouped[cat]
            if (!catDigests?.length) return null

            const summaryRow = summaries?.find((s) => s.scope === cat)
            const catSummary = summaryRow?.content as CategorySummaryContent | undefined

            return (
              <Section key={cat} style={{ marginBottom: "24px" }}>
                <Heading style={{ fontSize: "14px", color: "#374151", marginBottom: "4px" }}>
                  {DISPLAY[cat] ?? cat}
                </Heading>

                {catSummary?.text && (
                  <Text style={{ fontSize: "13px", color: "#6b7280", margin: "0 0 12px", fontStyle: "italic", borderLeft: "3px solid #e5e7eb", paddingLeft: "10px" }}>
                    {catSummary.text}
                  </Text>
                )}

                {catDigests.map((d) => {
                  const tierLabel = d.tierMap?.[cat] ? `T${d.tierMap[cat]}` : null
                  const tickerLine = d.tickers.length > 0
                    ? d.tickers.map((t) => {
                        const entry = d.tickerData?.[t]
                        if (!entry?.resolved || !entry.price) return t
                        const sign = (entry.change ?? 0) >= 0 ? "+" : ""
                        return `${t} ${formatPrice(entry.price)} (${sign}${entry.change}%)`
                      }).join(", ")
                    : null

                  return (
                    <Section key={d.handle} style={{ marginBottom: "14px" }}>
                      <Text style={{ margin: "0", fontWeight: "bold", fontSize: "13px" }}>
                        <Link
                          href={`https://x.com/${d.handle}`}
                          style={{ color: "#111827", textDecoration: "none" }}
                        >
                          @{d.handle}
                        </Link>
                        {tierLabel && (
                          <span style={{ color: "#9ca3af", fontSize: "11px", marginLeft: "6px" }}>{tierLabel}</span>
                        )}
                        {" "}{sentimentEmoji[d.sentiment] ?? ""}
                        {tickerLine && (
                          <span style={{ color: "#6b7280", fontWeight: "normal" }}> · {tickerLine}</span>
                        )}
                      </Text>
                      <Text style={{ margin: "3px 0 0", fontSize: "13px", color: "#374151" }}>{d.summary}</Text>
                    </Section>
                  )
                })}
              </Section>
            )
          })}

          <Hr />
          <Link href={dashboardUrl} style={{ fontSize: "12px", color: "#6b7280" }}>View full digest →</Link>
        </Container>
      </Body>
    </Html>
  )
}
