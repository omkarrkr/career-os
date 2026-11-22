import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { readEnvironment } from "./env.js";

const { DATABASE_URL } = readEnvironment();

const adapter = new PrismaPg({
    connectionString: DATABASE_URL,
});

const prisma = new PrismaClient({
    adapter,
});

export default prisma;
