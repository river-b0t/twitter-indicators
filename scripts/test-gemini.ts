import { summarizeAccountTweets } from "../lib/gemini"
import { config } from "dotenv"

config({ path: ".env.local" })

const sampleTweets = [
  { tweetId: "1", text: "BTC looking strong here, expecting a move to 70k soon. Accumulating.", postedAt: new Date() },
  { tweetId: "2", text: "ETH/BTC ratio bottoming. Time to rotate.", postedAt: new Date() },
  { tweetId: "3", text: "Macro data today is key. Watch the 10yr.", postedAt: new Date() },
]

console.log("Testing Gemini summarization...")

summarizeAccountTweets("test_account", sampleTweets)
  .then((result) => {
    console.log("Result:", JSON.stringify(result, null, 2))
    process.exit(0)
  })
  .catch((e) => {
    console.error("Error:", e)
    process.exit(1)
  })
