import { z } from "zod";

const environmentSchema = z.object({
    DATABASE_URL: z.string().trim().refine((value) => {
        try {
            const url = new URL(value);
            return ["postgres:", "postgresql:"].includes(url.protocol)
                && url.hostname.length > 0
                && url.pathname.length > 1;
        } catch {
            return false;
        }
    }),
    PORT: z.string().regex(/^\d+$/)
        .transform(Number)
        .pipe(z.number().int().min(1).max(65535)),
});

export const readEnvironment = (source: NodeJS.ProcessEnv = process.env) => {
    const result = environmentSchema.safeParse({
        DATABASE_URL: source.DATABASE_URL,
        PORT: source.PORT ?? "3000",
    });

    if (!result.success) {
        const fields = [...new Set(result.error.issues.map((issue) => issue.path[0]))];
        // Report setting names only: validator details could contain credentials.
        throw new Error(`Invalid environment settings: ${fields.join(", ")}`);
    }

    return result.data;
};
