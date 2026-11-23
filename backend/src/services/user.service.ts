import prisma from "../config/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import type { RegisterUserInput } from "../schemas/user.schema.js";
import { hashPassword } from "../utils/password.js";
import { ApiError } from "../utils/api-error.js";

const errorProperty = (value: unknown, key: string): unknown => {
    if (typeof value !== "object" || value === null) return undefined;
    return (value as Record<string, unknown>)[key];
};

export const createUser = async ({ name, email, password }: RegisterUserInput) => {
    const passwordHash = await hashPassword(password);

    try {
        return await prisma.user.create({
            data: { name, email, passwordHash },
            select: { id: true, name: true, email: true, createdAt: true },
        });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            const target = error.meta?.target;
            const cause = errorProperty(error.meta?.driverAdapterError, "cause");
            const constraint = errorProperty(cause, "constraint");
            const index = errorProperty(constraint, "index");
            if ((Array.isArray(target) && target.includes("email")) || target === "User_email_key" || index === "User_email_key") {
                throw new ApiError(409, "An account with this email already exists");
            }
        }
        throw error;
    }
};

export const getUserProfile = (id: number) => prisma.user.findUnique({
    where: { id }, select: { id: true, name: true, email: true, createdAt: true },
});
