// Stub — full implementation in Task 12
export async function sendDailyDigestEmail(
  _date: Date,
  _accounts: Array<{
    handle: string
    displayName: string
    categories: string[]
    summary: string
    sentiment: string
    tickers: string[]
  }>
): Promise<void> {
  throw new Error("Email not yet implemented")
}
