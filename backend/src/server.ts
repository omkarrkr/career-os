import "dotenv/config";
import { createServer } from "node:http";
import { readEnvironment } from "./config/env.js";
import { startServer } from "./server-lifecycle.js";

async function main() {
    let settings: ReturnType<typeof readEnvironment>;
    try {
        settings = readEnvironment();
    } catch (error) {
        console.error(error instanceof Error ? error.message : "Invalid environment settings");
        process.exitCode = 1;
        return;
    }

    try {
        // Validate settings before constructing the app's database client.
        const { default: app } = await import("./app.js");
        const { default: prisma } = await import("./config/prisma.js");
        const server = createServer(app);
        const lifecycle = await startServer(server, prisma, settings.PORT);

        console.log("Database connected");
        console.log(`Server is running on http://localhost:${settings.PORT}`);

        let stopping = false;
        const shutdown = (failed = false) => {
            if (stopping) return;
            stopping = true;
            console.log("Server shutdown started");

            void lifecycle.stop().then(() => {
                console.log("Server shutdown completed");
                process.exitCode = failed ? 1 : 0;
            }).catch(() => {
                console.error("Server shutdown failed or timed out");
                process.exit(1);
            });
        };

        process.on("SIGINT", () => shutdown());
        process.on("SIGTERM", () => shutdown());
        server.on("error", () => {
            console.error("HTTP server error");
            shutdown(true);
        });
    } catch {
        console.error("Server startup failed. Check database connectivity and port availability.");
        process.exitCode = 1;
    }
}

void main();
