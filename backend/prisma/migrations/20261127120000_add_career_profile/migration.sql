BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE "CareerProfile" (
    "userId" INTEGER NOT NULL,
    "institution" VARCHAR(200),
    "degree" VARCHAR(100),
    "graduationYear" INTEGER,
    "targetRole" VARCHAR(100),
    "weeklyLearningHours" INTEGER,
    "interests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "bio" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CareerProfile_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "CareerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CareerProfile_graduationYear_check" CHECK ("graduationYear" BETWEEN 1990 AND 2100),
    CONSTRAINT "CareerProfile_weeklyLearningHours_check" CHECK ("weeklyLearningHours" BETWEEN 1 AND 40),
    CONSTRAINT "CareerProfile_interests_check" CHECK (cardinality("interests") <= 10)
);

-- Profiles are private to backend-authenticated requests, not direct Data API clients.
ALTER TABLE "CareerProfile" ENABLE ROW LEVEL SECURITY;
COMMIT;
