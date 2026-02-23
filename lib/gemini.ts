import { GoogleGenerativeAI } from "@google/generative-ai"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" })

export interface DigestResult {
  summary: string
  sentiment: "bullish" | "bearish" | "neutral" | "mixed"
  tickers: string[]
  keyTweetIds: string[]
}

export async function summarizeAccountTweets(
  handle: string,
  tweets: Array<{ tweetId: string; text: string; postedAt: Date }>
): Promise<DigestResult> {
  if (tweets.length === 0) {
    return { summary: "No tweets today.", sentiment: "neutral", tickers: [], keyTweetIds: [] }
  }

  const tweetList = tweets
    .map((t) => `[${t.tweetId}] ${t.text}`)
    .join("\n\n")

  const prompt = `You are analyzing tweets from @${handle}, a market commentator/analyst.

Here are their tweets from today:
${tweetList}

Respond with a JSON object (no markdown, raw JSON only) with these fields:
- summary: 2-3 sentence summary of their key themes and views today
- sentiment: one of "bullish", "bearish", "neutral", or "mixed" based on overall market tone
- tickers: array of asset tickers or symbols mentioned (e.g. ["BTC", "ETH", "SPY"]), empty array if none
- keyTweetIds: array of 1-3 tweet IDs that best represent their most important points today

Example response:
{"summary":"...","sentiment":"bullish","tickers":["BTC","ETH"],"keyTweetIds":["123","456"]}`

  const result = await model.generateContent(prompt)
  const text = result.response.text().trim()

  try {
    return JSON.parse(text) as DigestResult
  } catch {
    // Gemini sometimes wraps in backticks despite instructions
    const cleaned = text.replace(/^```json?\n?/, "").replace(/\n?```$/, "")
    return JSON.parse(cleaned) as DigestResult
  }
}
