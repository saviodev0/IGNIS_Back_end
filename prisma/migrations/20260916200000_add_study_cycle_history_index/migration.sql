-- CreateIndex
CREATE INDEX "StudyCycle_userId_completed_completedAt_idx" ON "StudyCycle"("userId", "completed", "completedAt");
