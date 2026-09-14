import express from "express";
import userRoutes from "./routes/user.routes.js";

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        project: "CareerOS",
        version: "1.0.0",
        developer: "Omkar Kumar",
        status: "Backend Running ✅"
    });
});

app.use("/api/users", userRoutes);

export default app;
// res.send(`
// <h1>🚀 Welcome to CareerOS Backend!</h1>
// <p>Version 1.0.0</p>
// <p>Built with Express + TypeScript</p>
// `);