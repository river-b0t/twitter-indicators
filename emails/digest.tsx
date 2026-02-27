import {
  Html, Head, Body, Container, Section, Text, Heading, Hr, Link
} from "@react-email/components"

interface AccountDigest {
  handle: string
  displayName: string
  categories: string[]
  summary: string
  sentiment: string
  tickers: string[]
  tickerData?: Record<string, { price?: number; change?: number; resolved: boolean }>
}

interface DigestEmailProps {
  date: string
  digests: AccountDigest[]
  dashboardUrl: string
}

const CATEGORIES = ["traders", "crypto", "onchain", "vc", "tradfi", "thematic", "builders"]

const sentimentEmoji: Record<string, string> = {
  bullish: "📈",
  bearish: "📉",
  neutral: "➡️",
  mixed: "↕️",
}

export function DigestEmail({ date, digests, dashboardUrl }: DigestEmailProps) {
  const sentimentCounts = digests.reduce((acc, d) => {
    acc[d.sentiment] = (acc[d.sentiment] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const grouped = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = digests.filter((d) => d.categories.includes(cat))
    return acc
  }, {} as Record<string, AccountDigest[]>)

  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#f9fafb", padding: "20px" }}>
        <Container style={{ maxWidth: "600px", margin: "0 auto", backgroundColor: "#fff", padding: "32px", borderRadius: "8px" }}>
          <Heading style={{ fontSize: "20px", marginBottom: "4px" }}>Market Digest</Heading>
          <Text style={{ color: "#6b7280", marginTop: "0" }}>{date}</Text>

          <Text style={{ fontSize: "14px" }}>
            {Object.entries(sentimentCounts).map(([s, n]) => `${sentimentEmoji[s] ?? ""} ${n} ${s}`).join(" · ")}
          </Text>

          <Hr />

          {CATEGORIES.map((cat) => {
            const catDigests = grouped[cat]
            if (!catDigests?.length) return null
            return (
              <Section key={cat}>
                <Heading style={{ fontSize: "14px", textTransform: "capitalize", color: "#374151" }}>{cat}</Heading>
                {catDigests.map((d) => (
                  <Section key={d.handle} style={{ marginBottom: "16px" }}>
                    <Text style={{ margin: "0", fontWeight: "bold", fontSize: "13px" }}>
                      @{d.handle} {sentimentEmoji[d.sentiment] ?? ""}
                      {d.tickers.length > 0 && ` · ${d.tickers.map((t) => {
                        const entry = d.tickerData?.[t]
                        if (!entry?.resolved || !entry.price) return t
                        const sign = (entry.change ?? 0) >= 0 ? "+" : ""
                        return `${t} $${entry.price.toLocaleString("en-US", { maximumFractionDigits: 0 })} (${sign}${entry.change}%)`
                      }).join(", ")}`}
                    </Text>
                    <Text style={{ margin: "4px 0 0", fontSize: "13px", color: "#374151" }}>{d.summary}</Text>
                  </Section>
                ))}
              </Section>
            )
          })}

          <Hr />
          <Link href={dashboardUrl} style={{ fontSize: "12px", color: "#6b7280" }}>View full dashboard →</Link>
        </Container>
      </Body>
    </Html>
  )
}
