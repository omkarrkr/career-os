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
    NODE_ENV: z.enum(["development", "test", "production"]),
    AUTH_JWT_SECRET: z.string().regex(/^[a-f0-9]{64}$/i),
    AUTH_CSRF_SECRET: z.string().regex(/^[a-f0-9]{64}$/i),
    CORS_ORIGINS: z.string()
        .transform((value) => value.trim() === "" ? [] : value.split(",").map((origin) => origin.trim()))
        .pipe(z.array(z.string().refine((value) => {
            try {
                const url = new URL(value);
                return ["http:", "https:"].includes(url.protocol) && url.origin === value;
            } catch {
                return false;
            }
        }))),
}).refine((value) => value.AUTH_JWT_SECRET !== value.AUTH_CSRF_SECRET, {
    path: ["AUTH_CSRF_SECRET"], message: "Use independent secrets",
});

export const readEnvironment = (source: NodeJS.ProcessEnv = process.env) => {
    const result = environmentSchema.safeParse({
        DATABASE_URL: source.DATABASE_URL,
        PORT: source.PORT ?? "3000",
        NODE_ENV: source.NODE_ENV ?? "development",
        AUTH_JWT_SECRET: source.AUTH_JWT_SECRET,
        AUTH_CSRF_SECRET: source.AUTH_CSRF_SECRET,
        CORS_ORIGINS: source.CORS_ORIGINS ?? "",
    });

    if (!result.success) {
        const fields = [...new Set(result.error.issues.map((issue) => issue.path[0]))];
        // Report setting names only: validator details could contain credentials.
        throw new Error(`Invalid environment settings: ${fields.join(", ")}`);
    }

    return result.data;
};
