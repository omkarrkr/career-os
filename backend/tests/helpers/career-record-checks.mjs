import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
// Runs against PGlite or a private native restore, never imported by production.
export async function checkCareerRecords(db) {
  await db.query('BEGIN');
  try {
    const user=(await db.query(`INSERT INTO "User" (name,email,"passwordHash","updatedAt") VALUES ('Record fixture',$1,'synthetic',NOW()) RETURNING id`,[`records-${randomUUID()}@example.test`])).rows[0].id;
    const skill=(await db.query('SELECT id FROM "Skill" ORDER BY id LIMIT 1')).rows[0].id;
    const certification=(await db.query(`INSERT INTO "Certification" ("userId",title,issuer,"updatedAt") VALUES ($1,'Course','Fixture issuer',NOW()) RETURNING id`,[user])).rows[0].id;
    const experience=(await db.query(`INSERT INTO "Experience" ("userId",title,organization,"updatedAt") VALUES ($1,'Intern','Fixture organization',NOW()) RETURNING id`,[user])).rows[0].id;
    await db.query('INSERT INTO "CertificationSkill" ("certificationId","skillId","updatedAt") VALUES ($1,$2,NOW())',[certification,skill]);
    await db.query('INSERT INTO "ExperienceSkill" ("experienceId","skillId","updatedAt") VALUES ($1,$2,NOW())',[experience,skill]);
    const statements=[
      [`UPDATE "Certification" SET "issuedDate"='2026-11-28',"expiresDate"='2026-11-27' WHERE id=${certification}`,'23514'],
      [`UPDATE "Certification" SET "credentialUrl"='javascript:alert(1)' WHERE id=${certification}`,'23514'],
      [`UPDATE "Experience" SET "startDate"='2026-11-28',"endDate"='2026-11-27' WHERE id=${experience}`,'23514'],
      [`UPDATE "Experience" SET "isCurrent"=true,"endDate"='2026-11-28' WHERE id=${experience}`,'23514'],
      [`UPDATE "Experience" SET type='UNKNOWN' WHERE id=${experience}`,'23514'],
      [`UPDATE "Certification" SET issuer=' ' WHERE id=${certification}`,'23514'],
      [`UPDATE "Experience" SET achievements=repeat('x',2001) WHERE id=${experience}`,'22001'],
      [`INSERT INTO "CertificationSkill" ("certificationId","skillId","updatedAt") VALUES (${certification},${skill},NOW())`,'23505'],
      [`INSERT INTO "ExperienceSkill" ("experienceId","skillId","updatedAt") VALUES (${experience},2147483647,NOW())`,'23503'],
      [`INSERT INTO "ExperienceSkill" ("experienceId","skillId","updatedAt") VALUES (2147483647,${skill},NOW())`,'23503'],
    ];
    for(const [statement,code] of statements){
      await db.query('SAVEPOINT rejected');let denied=false;
      try{await db.query(statement);}catch(error){assert.equal(error.code,code);denied=true;await db.query('ROLLBACK TO SAVEPOINT rejected');}
      assert.equal(denied,true);
    }
    const role='records_'+randomUUID().replaceAll('-','');
    await db.query(`CREATE ROLE "${role}" NOLOGIN`);await db.query(`GRANT USAGE ON SCHEMA public TO "${role}"`);
    await db.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON "Certification","CertificationSkill","Experience","ExperienceSkill" TO "${role}"`);
    await db.query(`SET ROLE "${role}"`);
    for(const table of ['Certification','CertificationSkill','Experience','ExperienceSkill']) {
      assert.equal((await db.query(`SELECT * FROM "${table}"`)).rows.length,0);
      assert.equal((await db.query(`UPDATE "${table}" SET "updatedAt"=NOW() RETURNING *`)).rows.length,0);
      assert.equal((await db.query(`DELETE FROM "${table}" RETURNING *`)).rows.length,0);
    }
    for(const [table,key,id] of [['CertificationSkill','certificationId',certification],['ExperienceSkill','experienceId',experience]]){
      await db.query('SAVEPOINT private_insert');let denied=false;
      try{await db.query(`INSERT INTO "${table}" ("${key}","skillId","updatedAt") VALUES ($1,$2,NOW())`,[id,skill]);}catch(error){assert.equal(error.code,'42501');denied=true;await db.query('ROLLBACK TO SAVEPOINT private_insert');}assert.equal(denied,true);
    }
    await db.query('RESET ROLE');
    for(const [table,key,id] of [['Certification','certificationId',certification],['Experience','experienceId',experience]]){
      await db.query(`DELETE FROM "${table}" WHERE id=$1`,[id]);
      assert.equal((await db.query(`SELECT * FROM "${table}Skill" WHERE "${key}"=$1`,[id])).rows.length,0);
    }
    assert.equal((await db.query('SELECT id FROM "Skill" WHERE id=$1',[skill])).rows.length,1);
  } finally { await db.query('ROLLBACK'); }
}
