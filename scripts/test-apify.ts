import { fetchTweetsForAccount } from "../lib/apify"
import { config } from "dotenv"

config({ path: ".env.local" })

const handle = process.argv[2] ?? "unusual_whales"
const since = new Date()
since.setDate(since.getDate() - 1)

console.log(`Fetching tweets for @${handle} since ${since.toISOString()}...`)

fetchTweetsForAccount(handle, since)
  .then((tweets) => {
    console.log(`Fetched ${tweets.length} tweets`)
    if (tweets[0]) console.log("Sample:", JSON.stringify(tweets[0], null, 2))
    process.exit(0)
  })
  .catch((e) => {
    console.error("Error:", e)
    process.exit(1)
  })
