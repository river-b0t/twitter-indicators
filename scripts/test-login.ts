import { Scraper } from "agent-twitter-client"

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function main() {
  const scraper = new Scraper({
    fetch: (input: any, init?: any) => {
      const headers = new Headers(init?.headers)
      headers.set('user-agent', UA)
      return fetch(input, { ...init, headers })
    }
  })
  try {
    await scraper.login(
      process.env.TWITTER_USERNAME!,
      process.env.TWITTER_PASSWORD!,
      process.env.TWITTER_EMAIL!
    )
    const isLoggedIn = await scraper.isLoggedIn()
    console.log("Logged in:", isLoggedIn)

    if (isLoggedIn) {
      console.log("Fetching tweets for 'elonmusk'...")
      let count = 0
      for await (const tweet of scraper.getTweets("elonmusk", 3)) {
        console.log(`  [${tweet.timeParsed?.toISOString()}] ${tweet.text?.slice(0, 80)}`)
        if (++count >= 3) break
      }
    }
  } catch (e) {
    console.error("Error:", e)
  }
}

main()
