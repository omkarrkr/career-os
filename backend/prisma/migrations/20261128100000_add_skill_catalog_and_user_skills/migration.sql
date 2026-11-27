BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE "Skill" (
    "id" SERIAL NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "category" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Skill_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT "Skill_name_check" CHECK (length(btrim("name")) BETWEEN 1 AND 80),
    CONSTRAINT "Skill_category_check" CHECK (length(btrim("category")) BETWEEN 1 AND 80)
);
CREATE UNIQUE INDEX "Skill_slug_key" ON "Skill"("slug");

CREATE TABLE "UserSkill" (
    "userId" INTEGER NOT NULL,
    "skillId" INTEGER NOT NULL,
    "level" VARCHAR(12) NOT NULL DEFAULT 'BEGINNER',
    "notes" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserSkill_pkey" PRIMARY KEY ("userId", "skillId"),
    CONSTRAINT "UserSkill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserSkill_level_check" CHECK ("level" IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED'))
);
CREATE INDEX "UserSkill_skillId_idx" ON "UserSkill"("skillId");

-- A small maintained starter taxonomy, not a role-requirement or proficiency claim.
INSERT INTO "Skill" ("slug", "name", "category", "updatedAt") VALUES
    ('javascript', 'JavaScript', 'Programming language', CURRENT_TIMESTAMP),
    ('typescript', 'TypeScript', 'Programming language', CURRENT_TIMESTAMP),
    ('python', 'Python', 'Programming language', CURRENT_TIMESTAMP),
    ('java', 'Java', 'Programming language', CURRENT_TIMESTAMP),
    ('react', 'React', 'Frontend', CURRENT_TIMESTAMP),
    ('nodejs', 'Node.js', 'Backend', CURRENT_TIMESTAMP),
    ('postgresql', 'PostgreSQL', 'Database', CURRENT_TIMESTAMP),
    ('git', 'Git', 'Tooling', CURRENT_TIMESTAMP);

ALTER TABLE "Skill" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserSkill" ENABLE ROW LEVEL SECURITY;
COMMIT;
