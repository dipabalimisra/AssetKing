import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "fs-extra";
import path from "node:path";
import { fileURLToPath } from "node:url";
import generateRouter from "./routes/generate.js";
import { ensureWorkingDirs } from "./services/fileService.js";

dotenv.config({
  path: fileURLToPath(new URL("./.env", import.meta.url))
});

const app = express();
const port = process.env.PORT || 5000;
const serverDir = path.dirname(fileURLToPath(import.meta.url));
const errorLogPath = process.env.VERCEL
  ? path.join("/tmp", "assetking-error.log")
  : path.join(serverDir, "logs", "error.log");

await ensureWorkingDirs();
await fs.ensureDir(path.dirname(errorLogPath));

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get(["/health", "/api/health"], (_req, res) => {
  res.json({ ok: true });
});

app.use("/generate", generateRouter);
app.use("/api/generate", generateRouter);

app.use(async (err, req, res, _next) => {
  console.error(err);
  const status = err.statusCode || 500;
  const errorMessage = err.publicMessage || err.message || "Unable to generate product assets.";

  await fs.appendFile(
    errorLogPath,
    JSON.stringify({
      time: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl,
      status,
      message: errorMessage,
      stack: err.stack
    }) + "\n"
  );

  res.status(status).json({
    error: errorMessage
  });
});

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`AssetKing server running on http://localhost:${port}`);
  });
}

process.on("SIGINT", async () => {
  await fs.emptyDir("temp");
  process.exit(0);
});

export default app;
