import fs from "fs-extra";
import crypto from "node:crypto";
import path from "node:path";

const runtimeRoot = process.env.VERCEL ? path.join("/tmp", "assetking") : process.cwd();
const tempRoot = path.join(runtimeRoot, "temp");
const outputRoot = path.join(runtimeRoot, "output");

export async function ensureWorkingDirs() {
  await fs.ensureDir(tempRoot);
  await fs.ensureDir(outputRoot);
}

export function sanitizeFilename(value) {
  const sanitized = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return sanitized || "product-assets";
}

export async function buildJobPaths(baseName) {
  await ensureWorkingDirs();
  const jobId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const workDir = path.join(tempRoot, jobId);
  await fs.ensureDir(workDir);

  return {
    workDir,
    zipPath: path.join(outputRoot, `${baseName}-${jobId}.zip`)
  };
}

export async function cleanupJob(workDir) {
  await fs.remove(workDir);
}
