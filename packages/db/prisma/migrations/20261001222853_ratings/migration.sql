-- CreateEnum
CREATE TYPE "RatingEventKind" AS ENUM ('verified', 'contest', 'duel');

-- AlterTable
ALTER TABLE "Problem" ADD COLUMN     "ratingDeviation" DOUBLE PRECISION NOT NULL DEFAULT 200,
ADD COLUMN     "ratingVolatility" DOUBLE PRECISION NOT NULL DEFAULT 0.06;

-- CreateTable
CREATE TABLE "Rating" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "trackId" UUID NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 1500,
    "rd" DOUBLE PRECISION NOT NULL DEFAULT 350,
    "volatility" DOUBLE PRECISION NOT NULL DEFAULT 0.06,
    "events" INTEGER NOT NULL DEFAULT 0,
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatingChange" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "trackId" UUID NOT NULL,
    "eventKey" TEXT NOT NULL,
    "kind" "RatingEventKind" NOT NULL,
    "problemId" UUID,
    "score" DOUBLE PRECISION NOT NULL,
    "opponent" DOUBLE PRECISION NOT NULL,
    "ratingBefore" DOUBLE PRECISION NOT NULL,
    "ratingAfter" DOUBLE PRECISION NOT NULL,
    "rdBefore" DOUBLE PRECISION NOT NULL,
    "rdAfter" DOUBLE PRECISION NOT NULL,
    "volatility" DOUBLE PRECISION NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RatingChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemRatingRun" (
    "week" TEXT NOT NULL,
    "updated" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProblemRatingRun_pkey" PRIMARY KEY ("week")
);

-- CreateIndex
CREATE INDEX "Rating_trackId_rating_idx" ON "Rating"("trackId", "rating");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_userId_trackId_key" ON "Rating"("userId", "trackId");

-- CreateIndex
CREATE INDEX "RatingChange_userId_trackId_at_idx" ON "RatingChange"("userId", "trackId", "at");

-- CreateIndex
CREATE INDEX "RatingChange_problemId_at_idx" ON "RatingChange"("problemId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "RatingChange_userId_eventKey_key" ON "RatingChange"("userId", "eventKey");

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingChange" ADD CONSTRAINT "RatingChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingChange" ADD CONSTRAINT "RatingChange_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingChange" ADD CONSTRAINT "RatingChange_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
