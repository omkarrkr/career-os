import "dotenv/config";
import app from "./app.js";
import prisma from "./config/prisma.js";

const PORT = 3000;

async function startServer() {
    try {
        await prisma.$connect();

        console.log("✅ Database connected");

        app.listen(PORT, () => {
            console.log(`🚀 Server is running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("❌ Database connection failed:", error);
        process.exit(1);
    }
}

startServer();