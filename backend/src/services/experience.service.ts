import prisma from '../config/prisma.js';
import { Prisma } from '../generated/prisma/client.js';
import { ApiError } from '../utils/api-error.js';
import type { ExperienceInput } from '../schemas/career-record.schema.js';
const fields={id:true,title:true,organization:true,description:true,achievements:true,type:true,isCurrent:true,startDate:true,endDate:true,createdAt:true,updatedAt:true} as const;
const details={...fields,skills:{orderBy:{skillId:'asc' as const},select:{skillId:true,evidence:true,skill:{select:{id:true,slug:true,name:true,category:true}}}}} as const;
const dataFields=(input:ExperienceInput)=>({...(input.title!==undefined?{title:input.title}:{}),
    ...(input.organization!==undefined?{organization:input.organization}:{}),
    ...(input.description!==undefined?{description:input.description}:{}),
    ...(input.achievements!==undefined?{achievements:input.achievements}:{}),
    ...(input.type!==undefined?{type:input.type}:{}),
    ...(input.isCurrent!==undefined?{isCurrent:input.isCurrent}:{}),
    ...(input.startDate!==undefined?{startDate:input.startDate?new Date(input.startDate):null}:{}),
    ...(input.endDate!==undefined?{endDate:input.endDate?new Date(input.endDate):null}:{})});
const evidence=(skills:NonNullable<ExperienceInput['skills']>)=>skills.map(item=>({skillId:item.skillId,evidence:item.evidence??null}));
const missing=()=>new ApiError(404,'Experience not found');
function mapError(error:unknown):never {if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2003')throw new ApiError(400,'A linked catalog skill is unavailable');throw error;}
export const listExperiences=async(userId:number,limit:number,afterId?:number)=>{
    const rows=await prisma.experience.findMany({where:{userId,...(afterId!==undefined?{id:{gt:afterId}}:{})},select:{...fields,_count:{select:{skills:true}}},orderBy:{id:'asc'},take:limit+1});
    const data=rows.slice(0,limit);return {data,nextCursor:rows.length>limit?data.at(-1)!.id:null};
};
export const getExperience=async(userId:number,id:number)=>{const data=await prisma.experience.findFirst({where:{userId,id},select:details});if(!data)throw missing();return data;};
export const createExperience=async(userId:number,input:ExperienceInput&{title:string;organization:string})=>{
    try{return await prisma.experience.create({data:{...dataFields(input),title:input.title,organization:input.organization,userId,skills:{create:evidence(input.skills??[])}},select:details});}catch(error){return mapError(error);}
};
export const updateExperience=async(userId:number,id:number,input:ExperienceInput)=>{
    try{return await prisma.$transaction(async tx=>{
        const rows=await tx.$queryRaw<{startDate:string|null;endDate:string|null;isCurrent:boolean;}[]>`SELECT to_char("startDate",'YYYY-MM-DD') AS "startDate",to_char("endDate",'YYYY-MM-DD') AS "endDate","isCurrent" FROM "Experience" WHERE id=${id} AND "userId"=${userId} FOR UPDATE`;
        const saved=rows[0];if(!saved)throw missing();
        const start=input.startDate===undefined?saved.startDate:input.startDate,end=input.endDate===undefined?saved.endDate:input.endDate;
        if(start&&end&&end<start)throw new ApiError(400,'End/expiry date must not be before start/issue date');
        const current=input.isCurrent===undefined?saved.isCurrent:input.isCurrent;
            if(current&&end)throw new ApiError(400,'Current experience must not have an end date');
        return tx.experience.update({where:{userId,id},data:{...dataFields(input),...(input.skills!==undefined?{skills:{deleteMany:{},create:evidence(input.skills)}}:{})},select:details});
    });}catch(error){return mapError(error);}
};
export const deleteExperience=async(userId:number,id:number)=>{if(!(await prisma.experience.deleteMany({where:{userId,id}})).count)throw missing();};
