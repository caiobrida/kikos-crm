-- CreateEnum
CREATE TYPE "DealStage" AS ENUM ('NEW', 'CONTACT_MADE', 'PROPOSAL_SENT', 'NEGOTIATION', 'CLOSED');

-- CreateEnum
CREATE TYPE "DealResult" AS ENUM ('OPEN', 'WON', 'LOST');

-- CreateTable
CREATE TABLE "deals" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "valueInCents" INTEGER NOT NULL,
    "leadId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "stage" "DealStage" NOT NULL DEFAULT 'NEW',
    "result" "DealResult" NOT NULL DEFAULT 'OPEN',
    "description" TEXT,
    "expectedCloseDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "lastInteractionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deals_deletedAt_stage_lastInteractionAt_idx" ON "deals"("deletedAt", "stage", "lastInteractionAt");

-- CreateIndex
CREATE INDEX "deals_deletedAt_ownerId_idx" ON "deals"("deletedAt", "ownerId");

-- CreateIndex
CREATE INDEX "deals_deletedAt_leadId_idx" ON "deals"("deletedAt", "leadId");

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
