import type { Server } from "node:http";

type DatabaseConnection = {
    $connect: () => Promise<void>;
    $disconnect: () => Promise<void>;
};

export const startServer = async (
    server: Server,
    database: DatabaseConnection,
    port: number
) => {
    try {
        await database.$connect();

        await new Promise<void>((resolve, reject) => {
            const onError = (error: Error) => {
                server.removeListener("listening", onListening);
                reject(error);
            };
            const onListening = () => {
                server.removeListener("error", onError);
                resolve();
            };
            server.once("error", onError);
            server.listen(port, onListening);
        });
    } catch (error) {
        // Even a failed start may have opened database connections.
        await database.$disconnect().catch(() => undefined);
        throw error;
    }

    let stopPromise: Promise<void> | undefined;

    const stop = (timeoutMs = 10000): Promise<void> => {
        if (stopPromise) return stopPromise;

        stopPromise = (async () => {
            let timer: ReturnType<typeof setTimeout> | undefined;

            const closeResources = async () => {
                try {
                    await new Promise<void>((resolve, reject) => {
                        server.close((error) => error ? reject(error) : resolve());
                    });
                } finally {
                    await database.$disconnect();
                }
            };

            const deadline = new Promise<never>((_resolve, reject) => {
                timer = setTimeout(() => {
                    server.closeAllConnections();
                    reject(new Error("Server shutdown timed out"));
                }, timeoutMs);
            });

            try {
                await Promise.race([closeResources(), deadline]);
            } finally {
                clearTimeout(timer);
            }
        })();

        return stopPromise;
    };

    return { stop };
};
