-- CreateEnum
CREATE TYPE "SubmissionKind" AS ENUM ('run', 'submit');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('queued', 'running', 'done');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('accepted', 'wrong_answer', 'time_limit', 'memory_limit', 'output_limit', 'runtime_error', 'compile_error', 'internal_error');


-- CreateTable
CREATE TABLE "Submission" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "language" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "SubmissionKind" NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'queued',
    "verdict" "Verdict",
    "runtimeMs" INTEGER,
    "memoryKb" INTEGER,
    "testsPassed" INTEGER,
    "testsTotal" INTEGER,
    "seed" INTEGER NOT NULL,
    "customInput" JSONB,
    "result" JSONB,
    "jobId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT,
    "attemptId" UUID,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Submission_jobId_key" ON "Submission"("jobId");

-- CreateIndex
CREATE INDEX "Submission_userId_problemId_createdAt_idx" ON "Submission"("userId", "problemId", "createdAt");

-- CreateIndex
CREATE INDEX "Submission_status_createdAt_idx" ON "Submission"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_userId_idempotencyKey_key" ON "Submission"("userId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
