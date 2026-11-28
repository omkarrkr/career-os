import assert from 'node:assert/strict';
import test from 'node:test';
import { createUserSkillSchema, updateUserSkillSchema, catalogQuerySchema, skillListSchema } from '../src/schemas/skill.schema.ts';
test('personal skills accept bounded self-reported fields without caller ownership or catalog edits', () => {
    assert.deepEqual(createUserSkillSchema.parse({skillId:1}),{skillId:1,level:'BEGINNER'});
    assert.deepEqual(updateUserSkillSchema.parse({notes:null}),{notes:null});
    for(const value of [{skillId:0},{skillId:'1'},{skillId:1,userId:2},{skillId:1,level:'EXPERT'},{skillId:1,notes:'x'.repeat(1001)},{skillId:1,name:'Rename'}])assert.equal(createUserSkillSchema.safeParse(value).success,false);
    for(const value of [{},{userId:2},{skillId:2},{level:null},{notes:2},{slug:'rename'}])assert.equal(updateUserSkillSchema.safeParse(value).success,false);
});
test('skill lists and catalog search use bounded typed cursors and literal search text', () => {
    assert.equal(catalogQuerySchema.parse({q:'  React  '}).q,'React');
    for(const value of [{limit:'51'},{limit:['1','2']},{afterId:'-1'},{userId:'2'}])assert.equal(skillListSchema.safeParse(value).success,false);
    assert.equal(catalogQuerySchema.safeParse({q:'x'.repeat(81)}).success,false);
});
