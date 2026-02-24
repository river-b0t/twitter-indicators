import { prisma } from "../lib/prisma"
import bcrypt from "bcryptjs"

async function main() {
  const email = process.env.ADMIN_EMAIL!
  const password = process.env.ADMIN_PASSWORD!
  if (!email || !password) throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set")
  const hash = await bcrypt.hash(password, 12)
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, password: hash, name: "Wally" },
  })
  console.log(`User seeded: ${email}`)
}

main().finally(() => prisma.$disconnect())
