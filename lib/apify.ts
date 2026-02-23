import { ApifyClient } from "apify-client"

const client = new ApifyClient({ token: process.env.APIFY_TOKEN! })

export interface RawTweet {
  tweetId: string
  text: string
  postedAt: Date
  likesCount: number
  retweetsCount: number
  url: string
}

export async function fetchTweetsForAccount(
  handle: string,
  sinceDate: Date
): Promise<RawTweet[]> {
  const since = sinceDate.toISOString().split("T")[0] // YYYY-MM-DD

  const run = await client.actor("apidojo/tweet-scraper").call({
    startUrls: [{ url: `https://twitter.com/${handle}` }],
    maxItems: 200,
    sinceDate: since,
    includeSearchTerms: false,
  })

  const { items } = await client
    .dataset(run.defaultDatasetId)
    .listItems()

  return items
    .filter((item: any) => item.author?.userName?.toLowerCase() === handle.toLowerCase())
    .map((item: any) => ({
      tweetId: item.id ?? item.tweetId,
      text: item.text ?? item.fullText ?? "",
      postedAt: new Date(item.createdAt),
      likesCount: item.likeCount ?? 0,
      retweetsCount: item.retweetCount ?? 0,
      url: item.url ?? `https://twitter.com/${handle}/status/${item.id}`,
    }))
}
