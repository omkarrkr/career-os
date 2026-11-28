import { requireVisibleSkills } from './skill-visibility.js';
import prisma from '../config/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../utils/api-error.js';
import type { CertificationInput } from '../schemas/career-record.schema.js';
const fields={id:true,title:true,issuer:true,description:true,credentialId:true,credentialUrl:true,issuedDate:true,expiresDate:true,createdAt:true,updatedAt:true} as const;
const details={...fields,skills:{orderBy:{skillId:'asc' as const},select:{skillId:true,evidence:true,skill:{select:{id:true,slug:true,name:true,category:true}}}}} as const;
const dataFields=(input:CertificationInput)=>({...(input.title!==undefined?{title:input.title}:{}),
    ...(input.issuer!==undefined?{issuer:input.issuer}:{}),
    ...(input.description!==undefined?{description:input.description}:{}),
    ...(input.credentialId!==undefined?{credentialId:input.credentialId}:{}),
    ...(input.credentialUrl!==undefined?{credentialUrl:input.credentialUrl}:{}),
    ...(input.issuedDate!==undefined?{issuedDate:input.issuedDate?new Date(input.issuedDate):null}:{}),
    ...(input.expiresDate!==undefined?{expiresDate:input.expiresDate?new Date(input.expiresDate):null}:{})});
const evidence=(skills:NonNullable<CertificationInput['skills']>)=>skills.map(item=>({skillId:item.skillId,evidence:item.evidence??null}));
const missing=()=>new ApiError(404,'Certification not found');
function mapError(error:unknown):never {if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2003')throw new ApiError(400,'A linked catalog skill is unavailable');throw error;}
export const listCertifications=async(userId:number,limit:number,afterId?:number)=>{
    const rows=await prisma.certification.findMany({where:{userId,...(afterId!==undefined?{id:{gt:afterId}}:{})},select:{...fields,_count:{select:{skills:true}}},orderBy:{id:'asc'},take:limit+1});
    const data=rows.slice(0,limit);return {data,nextCursor:rows.length>limit?data.at(-1)!.id:null};
};
export const getCertification=async(userId:number,id:number)=>{const data=await prisma.certification.findFirst({where:{userId,id},select:details});if(!data)throw missing();return data;};
export const createCertification=async(userId:number,input:CertificationInput&{title:string;issuer:string})=>{
    try{return await prisma.$transaction(async tx=>{await requireVisibleSkills(tx,userId,input.skills??[]);return tx.certification.create({data:{...dataFields(input),title:input.title,issuer:input.issuer,userId,skills:{create:evidence(input.skills??[])}},select:details});});}catch(error){return mapError(error);}
};
export const updateCertification=async(userId:number,id:number,input:CertificationInput)=>{
    try{return await prisma.$transaction(async tx=>{
        const rows=await tx.$queryRaw<{issuedDate:string|null;expiresDate:string|null;}[]>`SELECT to_char("issuedDate",'YYYY-MM-DD') AS "issuedDate",to_char("expiresDate",'YYYY-MM-DD') AS "expiresDate" FROM "Certification" WHERE id=${id} AND "userId"=${userId} FOR UPDATE`;
        const saved=rows[0];if(!saved)throw missing();
        await requireVisibleSkills(tx,userId,input.skills??[]);
        const start=input.issuedDate===undefined?saved.issuedDate:input.issuedDate,end=input.expiresDate===undefined?saved.expiresDate:input.expiresDate;
        if(start&&end&&end<start)throw new ApiError(400,'End/expiry date must not be before start/issue date');

        return tx.certification.update({where:{userId,id},data:{...dataFields(input),...(input.skills!==undefined?{skills:{deleteMany:{},create:evidence(input.skills)}}:{})},select:details});
    });}catch(error){return mapError(error);}
};
export const deleteCertification=async(userId:number,id:number)=>{if(!(await prisma.certification.deleteMany({where:{userId,id}})).count)throw missing();};
