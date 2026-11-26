import assert from "node:assert/strict";
import test from "node:test";
import { careerProfileSchema, profileCompleteness } from "../src/schemas/career-profile.schema.ts";

test("career profile accepts bounded partial fields, explicit clearing and deduplicated interests", () => {
    assert.deepEqual(careerProfileSchema.parse({ institution: " College ", interests: [" Backend ", "backend", "AI"], bio: null }),
        { institution: "College", interests: ["Backend", "AI"], bio: null });
    assert.deepEqual(careerProfileSchema.parse({ interests: [] }), { interests: [] });
    assert.deepEqual(careerProfileSchema.parse({ weeklyLearningHours: 40, graduationYear: 2100 }), { weeklyLearningHours: 40, graduationYear: 2100 });
    for (const input of [{}, { bio: undefined }, { userId: 2 }, { email: "other@example.test" }, { institution: " " },
        { degree: "a".repeat(101) }, { graduationYear: "2028" }, { graduationYear: 1989 }, { graduationYear: 2101 },
        { weeklyLearningHours: 0 }, { weeklyLearningHours: 41 }, { weeklyLearningHours: 2.5 },
        { interests: null }, { interests: Array(11).fill("AI") }, { interests: [""] }, { interests: ["a".repeat(51)] },
        { bio: "a".repeat(1001) }, { bio: "bad\0value" }, { targetRole: "bad\ud800value" }, null, []]) {
        assert.equal(careerProfileSchema.safeParse(input).success, false);
    }
});

test("profile completeness is a transparent five-field checklist, independent of optional bio/interests", () => {
    assert.deepEqual(profileCompleteness(null), { completedFields: [], missingFields: ["institution", "degree", "graduationYear", "targetRole", "weeklyLearningHours"], totalFields: 5, isComplete: false });
    const profile = { institution: "College", degree: "BTech", graduationYear: 2028, targetRole: "Backend developer", weeklyLearningHours: 8 };
    assert.equal(profileCompleteness(profile).isComplete, true);
    assert.deepEqual(profileCompleteness({ ...profile, degree: null, targetRole: " " }).missingFields, ["degree", "targetRole"]);
    assert.equal(profileCompleteness({ ...profile, bio: null, interests: [] }).isComplete, true);
});
