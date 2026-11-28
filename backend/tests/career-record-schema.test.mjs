import assert from 'node:assert/strict';
import test from 'node:test';
import {createCertificationSchema as certification,updateCertificationSchema,createExperienceSchema as experience,updateExperienceSchema} from '../src/schemas/career-record.schema.ts';
test('certifications strictly validate issuer, credential URLs, calendar dates and skill links',()=>{
  assert.equal(certification.parse({title:' Course ',issuer:' Provider '}).title,'Course');
  for(const patch of [{issuer:''},{credentialUrl:'javascript:alert(1)'},{credentialUrl:'https://token:secret@example.test'},{issuedDate:'2026-02-30'},{issuedDate:'2026-11-28',expiresDate:'2026-11-27'},{credentialId:'x'.repeat(201)},{userId:2},{skills:[{skillId:1},{skillId:1}]},{skills:Array.from({length:21},(_,i)=>({skillId:i+1}))}])assert.equal(certification.safeParse({title:'Course',issuer:'Provider',...patch}).success,false);
  assert.deepEqual(updateCertificationSchema.parse({credentialId:null,expiresDate:null,skills:[]}),{credentialId:null,expiresDate:null,skills:[]});
  assert.equal(updateCertificationSchema.safeParse({}).success,false);
});
test('experience validates explicit current state, work types and date ranges',()=>{
  assert.equal(experience.safeParse({title:'Intern',organization:'Team',type:'INTERNSHIP',isCurrent:true,startDate:'2026-11-28'}).success,true);
  for(const patch of [{organization:''},{isCurrent:'true'},{isCurrent:true,endDate:'2026-11-28'},{type:'CEO'},{startDate:'2026-11-28',endDate:'2026-11-27'},{achievements:'x'.repeat(2001)},{skills:[{skillId:1,evidence:'x'.repeat(1001)}]},{userId:2}])assert.equal(experience.safeParse({title:'Role',organization:'Team',...patch}).success,false);
  assert.equal(updateExperienceSchema.safeParse({}).success,false);assert.equal(updateExperienceSchema.safeParse({isCurrent:false,endDate:null}).success,true);
});
