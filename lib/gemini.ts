import { GoogleGenerativeAI } from "@google/generative-ai"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" })

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

- summary: 2-3 sentence summary of their key market views and themes today. Focus on specific calls, asset views, and trade ideas. If they have no market signal today, say so plainly.

- sentiment: one of "bullish", "bearish", "neutral", or "mixed"
  Rules:
  - Base this ONLY on tweets with clear market signal (price predictions, trade calls, directional views on assets)
  - IGNORE non-signal tweets (general news, political commentary, questions, jokes, lifestyle content)
  - "neutral" = no clear market signal in any tweet, OR the account only posted non-signal content
  - "mixed" = conflicting signals (e.g. bullish on one asset, bearish on another — NOT a mix of signal and non-signal tweets)
  - "bullish" = net positive market outlook across signal tweets
  - "bearish" = net negative market outlook across signal tweets

- tickers: array of asset ticker SYMBOLS mentioned. Rules:
  - Only include standard traded asset symbols (stocks, crypto, ETFs, forex, commodities)
  - Use the official ticker symbol, NOT the full name: "Bitcoin" → "BTC", "Ethereum" → "ETH", "Hyperliquid" → "HYPE", "Solana" → "SOL"
  - Do NOT include: generic words ("crypto", "defi", "nfts"), geographic names ("iran", "china", "russia"), company names that aren't tickers, or vague terms ("commodities", "altcoins")
  - Do NOT include duplicate symbols
  - Empty array if no specific traded assets are mentioned

- keyTweetIds: array of 1-3 tweet IDs that contain the clearest market signal (specific calls, predictions, trade ideas). Exclude non-signal tweets. Empty array if no signal tweets.

Example response:
{"summary":"Bullish on BTC near-term, sees ETH lagging. Called out weakness in small caps.","sentiment":"bullish","tickers":["BTC","ETH"],"keyTweetIds":["123","456"]}`

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
