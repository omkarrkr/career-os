BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE UNIQUE INDEX "Goal_id_userId_key" ON "Goal"("id","userId");
CREATE UNIQUE INDEX "Project_id_userId_key" ON "Project"("id","userId");
CREATE TABLE "ProjectGoal" (
    "projectId" INTEGER NOT NULL,
    "goalId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectGoal_pkey" PRIMARY KEY ("projectId","goalId"),
    CONSTRAINT "ProjectGoal_projectId_userId_fkey" FOREIGN KEY ("projectId","userId") REFERENCES "Project"("id","userId") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectGoal_goalId_userId_fkey" FOREIGN KEY ("goalId","userId") REFERENCES "Goal"("id","userId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ProjectGoal_goalId_projectId_idx" ON "ProjectGoal"("goalId","projectId");
ALTER TABLE "ProjectGoal" ENABLE ROW LEVEL SECURITY;
COMMIT;
