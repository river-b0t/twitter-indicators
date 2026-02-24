-- CreateEnum
CREATE TYPE "Sentiment" AS ENUM ('bullish', 'bearish', 'neutral', 'mixed');

-- CreateEnum
CREATE TYPE "DigestStatus" AS ENUM ('pending', 'complete', 'failed');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('sent', 'failed');

-- CreateTable
CREATE TABLE "TwitterAccount" (
    "id" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "categories" TEXT[],
    "avatarUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwitterAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tweet" (
    "id" TEXT NOT NULL,
    "tweetId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "retweetsCount" INTEGER NOT NULL DEFAULT 0,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tweet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyDigest" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "summary" TEXT,
    "sentiment" "Sentiment",
    "tickers" TEXT[],
    "keyTweetIds" TEXT[],
    "status" "DigestStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyDigest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigestEmail" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sentAt" TIMESTAMP(3),
    "status" "EmailStatus" NOT NULL,
    "error" TEXT,

    CONSTRAINT "DigestEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "password" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "TwitterAccount_handle_key" ON "TwitterAccount"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "Tweet_tweetId_key" ON "Tweet"("tweetId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyDigest_accountId_date_key" ON "DailyDigest"("accountId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- AddForeignKey
ALTER TABLE "Tweet" ADD CONSTRAINT "Tweet_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TwitterAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyDigest" ADD CONSTRAINT "DailyDigest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TwitterAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
