BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE "Goal" ADD COLUMN "priority" VARCHAR(6) NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_priority_check" CHECK ("priority" IN ('LOW', 'MEDIUM', 'HIGH'));

CREATE TABLE "Subtask" (
    "id" SERIAL NOT NULL,
    "goalId" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Subtask_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Subtask_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Subtask_title_check" CHECK (length(btrim("title")) BETWEEN 1 AND 200)
);
CREATE INDEX "Subtask_goalId_id_idx" ON "Subtask"("goalId", "id");

-- Ownership is inherited from Goal; direct Data API clients have no policies.
ALTER TABLE "Subtask" ENABLE ROW LEVEL SECURITY;
COMMIT;
