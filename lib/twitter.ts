import { Scraper } from "agent-twitter-client"
import { Cookie } from "tough-cookie"

export interface RawTweet {
  tweetId: string
  text: string
  postedAt: Date
  likesCount: number
  retweetsCount: number
  url: string
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function twitterFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  headers.set('user-agent', UA)
  return fetch(input, { ...init, headers })
}

async function getAuthenticatedScraper(): Promise<Scraper> {
  const scraper = new Scraper({ fetch: twitterFetch })

  const rawCookies = process.env.TWITTER_COOKIES
  if (!rawCookies) throw new Error("TWITTER_COOKIES env var is not set")

  // Accepts either a JSON array of cookie objects or a Netscape/header string
  let cookies: Cookie[]
  try {
    const parsed = JSON.parse(rawCookies) as Array<{ name: string; value: string; domain?: string; path?: string }>
    cookies = parsed.map((c) =>
      new Cookie({ key: c.name, value: c.value, domain: c.domain ?? ".twitter.com", path: c.path ?? "/" })
    )
  } catch {
    throw new Error("TWITTER_COOKIES must be a JSON array of {name, value, domain?, path?} objects")
  }

  await scraper.setCookies(cookies)
  return scraper
}

export async function fetchTweetsForAccount(
  handle: string,
  sinceDate: Date
): Promise<RawTweet[]> {
  const scraper = await getAuthenticatedScraper()
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
