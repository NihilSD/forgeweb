-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('in_progress', 'followups', 'verified', 'unverified', 'review', 'appealed', 'expired');

-- CreateEnum
CREATE TYPE "AppealOutcome" AS ENUM ('pending', 'upheld', 'denied');

-- CreateTable
CREATE TABLE "Attempt" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "instanceHash" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "submissionId" UUID,
    "score" INTEGER,
    "integrityScore" INTEGER,
    "signals" JSONB,
    "status" "AttemptStatus" NOT NULL DEFAULT 'in_progress',
    "finishedAt" TIMESTAMP(3),
    "replayPublic" BOOLEAN NOT NULL DEFAULT false,
    "replayDeletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttemptEvent" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "seq" INTEGER,
    "source" TEXT NOT NULL,
    "t" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "payload" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttemptEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUp" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "questionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" JSONB,
    "expected" JSONB NOT NULL,
    "order" INTEGER NOT NULL,
    "shownAt" TIMESTAMP(3),
    "answer" TEXT,
    "correct" BOOLEAN,
    "answeredMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "reviewerId" UUID,
    "decision" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appeal" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "previous" "AttemptStatus" NOT NULL,
    "outcome" "AppealOutcome" NOT NULL DEFAULT 'pending',
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Attempt_submissionId_key" ON "Attempt"("submissionId");

-- CreateIndex
CREATE INDEX "Attempt_userId_startedAt_idx" ON "Attempt"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "Attempt_problemId_status_idx" ON "Attempt"("problemId", "status");

-- CreateIndex
CREATE INDEX "Attempt_problemId_instanceHash_idx" ON "Attempt"("problemId", "instanceHash");

-- CreateIndex
CREATE INDEX "Attempt_status_submittedAt_idx" ON "Attempt"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "AttemptEvent_attemptId_t_idx" ON "AttemptEvent"("attemptId", "t");

-- CreateIndex
CREATE UNIQUE INDEX "AttemptEvent_attemptId_seq_key" ON "AttemptEvent"("attemptId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "FollowUp_attemptId_questionId_key" ON "FollowUp"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "Review_attemptId_idx" ON "Review"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "Appeal_attemptId_key" ON "Appeal"("attemptId");

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptEvent" ADD CONSTRAINT "AttemptEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appeal" ADD CONSTRAINT "Appeal_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
