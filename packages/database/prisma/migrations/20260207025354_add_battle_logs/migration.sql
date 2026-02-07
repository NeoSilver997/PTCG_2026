-- CreateTable
CREATE TABLE "battle_logs" (
    "id" TEXT NOT NULL,
    "matchTitle" TEXT NOT NULL,
    "player1Name" TEXT NOT NULL,
    "player2Name" TEXT NOT NULL,
    "winnerName" TEXT,
    "turnCount" INTEGER NOT NULL,
    "durationSeconds" INTEGER,
    "actions" JSONB NOT NULL,
    "rawLog" TEXT,
    "tournamentResultId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "battle_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "battle_logs_tournamentResultId_key" ON "battle_logs"("tournamentResultId");

-- CreateIndex
CREATE INDEX "battle_logs_player1Name_player2Name_idx" ON "battle_logs"("player1Name", "player2Name");

-- CreateIndex
CREATE INDEX "battle_logs_createdAt_idx" ON "battle_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "battle_logs" ADD CONSTRAINT "battle_logs_tournamentResultId_fkey" FOREIGN KEY ("tournamentResultId") REFERENCES "tournament_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;
