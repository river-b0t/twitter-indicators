import { Scraper } from "agent-twitter-client"

export interface RawTweet {
  tweetId: string
  text: string
  postedAt: Date
  likesCount: number
  retweetsCount: number
  url: string
}

async function getLoggedInScraper(): Promise<Scraper> {
  const scraper = new Scraper()
  await scraper.login(
    process.env.TWITTER_USERNAME!,
    process.env.TWITTER_PASSWORD!,
    process.env.TWITTER_EMAIL!
  )
  return scraper
}

export async function fetchTweetsForAccount(
  handle: string,
  sinceDate: Date
): Promise<RawTweet[]> {
  const scraper = await getLoggedInScraper()
  const tweets: RawTweet[] = []

  for await (const tweet of scraper.getTweets(handle, 50)) {
    if (!tweet.timeParsed || tweet.timeParsed < sinceDate) continue
    tweets.push({
      tweetId: tweet.id!,
      text: tweet.text ?? "",
      postedAt: tweet.timeParsed,
      likesCount: tweet.likes ?? 0,
      retweetsCount: tweet.retweets ?? 0,
      url: tweet.permanentUrl ?? `https://twitter.com/${handle}/status/${tweet.id}`,
    })
  }

  return tweets
}
