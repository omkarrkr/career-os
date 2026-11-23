import { z } from "zod";

export const registerUserSchema = z.object({
    name: z.string({ error: "Name must be text" }).trim()
        .min(1, "Name is required").max(100, "Name must be at most 100 characters")
        .refine((value) => !value.includes("\0") && value.isWellFormed(), "Name contains invalid characters"),
    email: z.string({ error: "Email must be text" }).trim().toLowerCase()
        .max(254, "Email must be at most 254 characters")
        .pipe(z.email({ error: "A valid email address is required" })),
    // Passwords are not trimmed, lowercased or otherwise normalized.
    password: z.string({ error: "Password must be text" })
        .max(72, "Password must fit within 72 UTF-8 bytes")
        .refine((value) => [...value].length >= 15, "Password must contain at least 15 characters")
        .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Password must fit within 72 UTF-8 bytes")
        .refine((value) => /\S/u.test(value), "Password must not be only whitespace")
        .refine((value) => !value.includes("\0") && value.isWellFormed(), "Password contains invalid characters"),
});

export type RegisterUserInput = z.infer<typeof registerUserSchema>;
