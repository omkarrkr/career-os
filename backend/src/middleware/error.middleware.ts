import type { NextFunction, Request, Response } from "express";

export const notFoundHandler = (_req: Request, res: Response) => {
    res.status(404).json({ message: "Route not found" });
};

export const errorHandler = (
    error: unknown,
    _req: Request,
    res: Response,
    next: NextFunction
) => {
    if (res.headersSent) {
        next(error);
        return;
    }

    const type = typeof error === "object" && error !== null && "type" in error
        ? error.type
        : undefined;

    if (type === "entity.parse.failed") {
        res.status(400).json({ message: "Invalid JSON body" });
        return;
    }

    if (type === "entity.too.large") {
        res.status(413).json({ message: "Request body is too large" });
        return;
    }

    const status = typeof error === "object" && error !== null && "status" in error
        ? error.status
        : undefined;

    if (typeof status === "number" && Number.isInteger(status) && status >= 400 && status < 500) {
        res.status(status).json({ message: "Invalid request" });
        return;
    }

    console.error("Unhandled request error");
    res.status(500).json({ message: "Internal server error" });
};
