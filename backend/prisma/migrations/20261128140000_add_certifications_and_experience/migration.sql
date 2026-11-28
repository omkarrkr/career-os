BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE "Certification" (
"id" SERIAL NOT NULL,
"userId" INTEGER NOT NULL,
"title" VARCHAR(200) NOT NULL,
"issuer" VARCHAR(200) NOT NULL ,
"description" VARCHAR(3000) ,
"credentialId" VARCHAR(200) ,
"credentialUrl" VARCHAR(2048) ,
"issuedDate" DATE ,
"expiresDate" DATE ,
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updatedAt" TIMESTAMP(3) NOT NULL,
CONSTRAINT "Certification_pkey" PRIMARY KEY ("id"),
CONSTRAINT "Certification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
CONSTRAINT "Certification_title_check" CHECK (length(btrim("title")) BETWEEN 1 AND 200),
CONSTRAINT "Certification_dates_check" CHECK ("issuedDate" IS NULL OR "expiresDate" IS NULL OR "expiresDate">="issuedDate"),
CONSTRAINT "Certification_issuer_check" CHECK (length(btrim("issuer")) BETWEEN 1 AND 200),
CONSTRAINT "Certification_url_check" CHECK ("credentialUrl" IS NULL OR "credentialUrl" ~ '^https?://[^[:space:]]+$')
);
CREATE INDEX "Certification_userId_id_idx" ON "Certification"("userId","id");
CREATE TABLE "CertificationSkill" (
"certificationId" INTEGER NOT NULL, "skillId" INTEGER NOT NULL, "evidence" VARCHAR(1000),
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
CONSTRAINT "CertificationSkill_pkey" PRIMARY KEY ("certificationId","skillId"),
CONSTRAINT "CertificationSkill_certificationId_fkey" FOREIGN KEY ("certificationId") REFERENCES "Certification"("id") ON DELETE CASCADE ON UPDATE CASCADE,
CONSTRAINT "CertificationSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "CertificationSkill_skillId_idx" ON "CertificationSkill"("skillId");
ALTER TABLE "Certification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CertificationSkill" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "Experience" (
"id" SERIAL NOT NULL,
"userId" INTEGER NOT NULL,
"title" VARCHAR(200) NOT NULL,
"organization" VARCHAR(200) NOT NULL ,
"description" VARCHAR(3000) ,
"achievements" VARCHAR(2000) ,
"type" VARCHAR(12) NOT NULL DEFAULT 'OTHER' ,
"startDate" DATE ,
"endDate" DATE ,
"isCurrent" BOOLEAN NOT NULL DEFAULT false ,
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updatedAt" TIMESTAMP(3) NOT NULL,
CONSTRAINT "Experience_pkey" PRIMARY KEY ("id"),
CONSTRAINT "Experience_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
CONSTRAINT "Experience_title_check" CHECK (length(btrim("title")) BETWEEN 1 AND 200),
CONSTRAINT "Experience_dates_check" CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "endDate">="startDate"),
CONSTRAINT "Experience_current_check" CHECK (NOT "isCurrent" OR "endDate" IS NULL),
CONSTRAINT "Experience_organization_check" CHECK (length(btrim("organization")) BETWEEN 1 AND 200),
CONSTRAINT "Experience_type_check" CHECK ("type" IN ('INTERNSHIP','EMPLOYMENT','FREELANCE','VOLUNTEERING','OTHER'))
);
CREATE INDEX "Experience_userId_id_idx" ON "Experience"("userId","id");
CREATE TABLE "ExperienceSkill" (
"experienceId" INTEGER NOT NULL, "skillId" INTEGER NOT NULL, "evidence" VARCHAR(1000),
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
CONSTRAINT "ExperienceSkill_pkey" PRIMARY KEY ("experienceId","skillId"),
CONSTRAINT "ExperienceSkill_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE CASCADE ON UPDATE CASCADE,
CONSTRAINT "ExperienceSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ExperienceSkill_skillId_idx" ON "ExperienceSkill"("skillId");
ALTER TABLE "Experience" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ExperienceSkill" ENABLE ROW LEVEL SECURITY;
COMMIT;
