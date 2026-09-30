-- CreateEnum
CREATE TYPE "ProblemStatus" AS ENUM ('draft', 'published', 'retired');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('needs_review', 'approved');

-- CreateEnum
CREATE TYPE "ProblemMode" AS ENUM ('practice', 'competitive', 'both');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('easy', 'medium', 'hard', 'expert');

-- CreateTable
CREATE TABLE "Track" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Track_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Problem" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "trackId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "rating" INTEGER NOT NULL,
    "tags" TEXT[],
    "formats" TEXT[],
    "languages" TEXT[],
    "mode" "ProblemMode" NOT NULL,
    "status" "ProblemStatus" NOT NULL DEFAULT 'draft',
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'needs_review',
    "version" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "searchText" TEXT NOT NULL DEFAULT '',
    "search" tsvector GENERATED ALWAYS AS (to_tsvector('simple', "searchText")) STORED,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Problem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemVersion" (
    "id" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "packageHash" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "limits" JSONB NOT NULL,
    "manifest" JSONB NOT NULL,
    "starters" JSONB NOT NULL,
    "hints" JSONB NOT NULL,
    "editorial" TEXT NOT NULL,
    "references" JSONB NOT NULL,
    "moduleCode" TEXT NOT NULL,
    "validationReport" JSONB,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProblemVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Track_slug_key" ON "Track"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Problem_slug_key" ON "Problem"("slug");

-- CreateIndex
CREATE INDEX "Problem_trackId_status_idx" ON "Problem"("trackId", "status");

-- CreateIndex
CREATE INDEX "Problem_status_difficulty_idx" ON "Problem"("status", "difficulty");

-- CreateIndex
CREATE INDEX "Problem_search_idx" ON "Problem" USING GIN ("search");

-- CreateIndex
CREATE INDEX "ProblemVersion_packageHash_idx" ON "ProblemVersion"("packageHash");

-- CreateIndex
CREATE UNIQUE INDEX "ProblemVersion_problemId_version_key" ON "ProblemVersion"("problemId", "version");

-- AddForeignKey
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemVersion" ADD CONSTRAINT "ProblemVersion_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
