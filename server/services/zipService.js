import archiver from "archiver";
import fs from "fs-extra";
import path from "node:path";

export async function createZip({ outputPath, files }) {
  await fs.ensureDir(path.dirname(outputPath));

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve(outputPath));
    archive.on("error", reject);

    archive.pipe(output);

    for (const file of files) {
      archive.file(file.path, { name: file.name });
    }

    archive.finalize();
  });
}
