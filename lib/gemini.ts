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

  const prompt = `You are analyzing tweets from @${handle}, a financial Twitter account.

Here are their tweets from today:
${tweetList}

Respond with a JSON object (no markdown, raw JSON only) with these fields:

- summary: 2-3 sentence summary of their key market views and themes today.

  WRITING STYLE — critical:
  - Write in direct takeaway style. Do NOT mention the account handle. Do NOT use pronouns ("they", "the account", "the commentator", "the analyst").
  - Go straight to the view. Example: "Bullish on BTC, expecting a retest of $100k." NOT "They are bullish on BTC and expect a retest of $100k."
  - Example: "Skeptical about QQQ's current valuation." NOT "However, they express skepticism about QQQ's current valuation."
  - Example: "First signs of constructive price action today. Potential shift towards a more positive market outlook." NOT "Observes the first signs of constructive price action, noting this suggests a potential shift..."
  - Focus on specific calls, asset views, and trade ideas.
  - If there is no market signal today, say so plainly in one sentence.

  SATIRE / IRONY — critical:
  - Some tweets are satirical, sarcastic, or ironic — mocking or parodying other market participants' views rather than expressing genuine ones.
  - Common patterns: copy-pasting or slightly exaggerating another account's thesis to mock it; using obvious hyperbole about low-cap coins as "catch-up trades"; ironic air quotes around market "analysis"; dunking on wave theory, Elliott wave counts, or specific trading frameworks.
  - If a tweet appears to be mocking a viewpoint rather than genuinely holding it, do NOT attribute that view. Either exclude it or note it is satirical (e.g. "Satirizes accounts pumping low-cap coins as catch-up trades.").
  - Context clue: if the writing style mimics viral crypto Twitter tropes or reads as parody, treat it as satire.

- sentiment: one of "bullish", "bearish", "neutral", or "mixed"
  Rules:
  - Base this ONLY on tweets with clear genuine market signal (price predictions, trade calls, directional views on assets)
  - IGNORE non-signal tweets (general news, political commentary, questions, jokes, lifestyle content, satire)
  - "neutral" = no clear market signal in any tweet, OR the account only posted non-signal content
  - "mixed" = conflicting signals (e.g. bullish on one asset, bearish on another — NOT a mix of signal and non-signal tweets)
  - "bullish" = net positive market outlook across signal tweets
  - "bearish" = net negative market outlook across signal tweets

- tickers: array of asset ticker SYMBOLS mentioned. Rules:
  - Only include standard traded asset symbols (stocks, crypto, ETFs, forex, commodities)
  - Use the official ticker symbol, NOT the full name: "Bitcoin" → "BTC", "Ethereum" → "ETH", "Hyperliquid" → "HYPE", "Solana" → "SOL"
  - Do NOT include tickers from satirical tweets
  - Do NOT include: generic words ("crypto", "defi", "nfts"), geographic names ("iran", "china", "russia"), company names that aren't tickers, or vague terms ("commodities", "altcoins")
  - Do NOT include duplicate symbols
  - Empty array if no specific traded assets are mentioned

- keyTweetIds: array of 1-3 tweet IDs that contain the clearest genuine market signal (specific calls, predictions, trade ideas). Exclude non-signal and satirical tweets. Empty array if no signal tweets.

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
