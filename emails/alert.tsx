import {
  Html, Head, Body, Container, Section, Text, Heading, Hr, Link
} from "@react-email/components"
import { formatDistanceToNow } from "date-fns"

interface MatchedTweet {
  handle: string
  text: string
  postedAt: Date
  url: string
}

interface AlertEmailProps {
  matchesByKeyword: Record<string, MatchedTweet[]>
  dashboardUrl: string
}

export function AlertEmail({ matchesByKeyword, dashboardUrl }: AlertEmailProps) {
  const totalCount = Object.values(matchesByKeyword).reduce((n, arr) => n + arr.length, 0)

  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "sans-serif", backgroundColor: "#f9fafb", padding: "20px" }}>
        <Container style={{ maxWidth: "600px", margin: "0 auto", backgroundColor: "#fff", padding: "32px", borderRadius: "8px" }}>
          <Heading style={{ fontSize: "20px", marginBottom: "4px" }}>Market Digest Alerts</Heading>
          <Text style={{ color: "#6b7280", marginTop: "0", fontSize: "13px" }}>
            {totalCount} keyword match{totalCount !== 1 ? "es" : ""} in the last 4 hours
          </Text>

          <Hr />

          {Object.entries(matchesByKeyword).map(([keyword, tweets]) => (
            <Section key={keyword} style={{ marginBottom: "24px" }}>
              <Heading style={{ fontSize: "14px", color: "#374151", marginBottom: "8px" }}>
                "{keyword}" — {tweets.length} match{tweets.length !== 1 ? "es" : ""}
              </Heading>
              {tweets.map((tweet) => (
                <Section key={tweet.url} style={{ marginBottom: "12px", paddingLeft: "12px", borderLeft: "2px solid #e5e7eb" }}>
                  <Text style={{ margin: "0", fontSize: "12px", color: "#6b7280" }}>
                    @{tweet.handle} · {formatDistanceToNow(new Date(tweet.postedAt), { addSuffix: true })}
                  </Text>
                  <Text style={{ margin: "4px 0 0", fontSize: "13px", color: "#111827" }}>{tweet.text}</Text>
                  <Link href={tweet.url} style={{ fontSize: "11px", color: "#9ca3af" }}>View on X →</Link>
                </Section>
              ))}
            </Section>
          ))}

          <Hr />
          <Link href={dashboardUrl} style={{ fontSize: "12px", color: "#6b7280" }}>Open dashboard →</Link>
        </Container>
      </Body>
    </Html>
  )
}
