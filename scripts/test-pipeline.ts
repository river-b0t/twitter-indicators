import { runDigestPipeline } from "../lib/pipeline"
import { config } from "dotenv"

config({ path: ".env.local" })

console.log("Running digest pipeline for today...")

runDigestPipeline()
  .then((results) => {
    console.log("Pipeline complete:")
    results.forEach((r) => {
      if (r.status === "fulfilled") {
        console.log(`  ✓ @${r.handle}`)
      } else {
        console.log(`  ✗ @${r.handle}: ${r.error}`)
      }
    })
    process.exit(0)
  })
  .catch((e) => {
    console.error("Pipeline failed:", e)
    process.exit(1)
  })
