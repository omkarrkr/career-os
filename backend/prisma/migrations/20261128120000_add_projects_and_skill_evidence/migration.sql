BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE "Project" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(3000),
    "outcome" VARCHAR(2000),
    "status" VARCHAR(12) NOT NULL DEFAULT 'PLANNED',
    "startDate" DATE,
    "endDate" DATE,
    "repositoryUrl" VARCHAR(2048),
    "demoUrl" VARCHAR(2048),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Project_title_check" CHECK (length(btrim("title")) BETWEEN 1 AND 200),
    CONSTRAINT "Project_status_check" CHECK ("status" IN ('PLANNED','IN_PROGRESS','COMPLETED')),
    CONSTRAINT "Project_dates_check" CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "endDate" >= "startDate"),
    CONSTRAINT "Project_repositoryUrl_check" CHECK ("repositoryUrl" IS NULL OR "repositoryUrl" ~ '^https?://[^[:space:]]+$'),
    CONSTRAINT "Project_demoUrl_check" CHECK ("demoUrl" IS NULL OR "demoUrl" ~ '^https?://[^[:space:]]+$')
);
CREATE INDEX "Project_userId_id_idx" ON "Project"("userId","id");

CREATE TABLE "ProjectSkill" (
    "projectId" INTEGER NOT NULL,
    "skillId" INTEGER NOT NULL,
    "evidence" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectSkill_pkey" PRIMARY KEY ("projectId","skillId"),
    CONSTRAINT "ProjectSkill_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ProjectSkill_skillId_idx" ON "ProjectSkill"("skillId");
ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProjectSkill" ENABLE ROW LEVEL SECURITY;
COMMIT;
