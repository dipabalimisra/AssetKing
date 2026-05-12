import express from "express";
import fs from "fs-extra";
import path from "node:path";
import { cleanProductInfo, generateFeaturesHTML } from "../services/aiService.js";
import { buildJobPaths, cleanupJob, sanitizeFilename } from "../services/fileService.js";
import { convertToJPG, createFallbackImages, downloadImages, searchImages } from "../services/imageService.js";
import { createZip } from "../services/zipService.js";

const router = express.Router();

router.post("/", async (req, res, next) => {
  const rawProduct = typeof req.body?.product === "string" ? req.body.product.trim() : "";

  if (!rawProduct) {
    return res.status(400).json({ error: "Enter a product name before generating assets." });
  }

  const safeBaseName = sanitizeFilename(rawProduct);
  const paths = await buildJobPaths(safeBaseName);

  try {
    const productInfo = await cleanProductInfo(rawProduct);
    const featuresHTML = await generateFeaturesHTML(productInfo.cleanTitle || rawProduct);
    const featuresPath = path.join(paths.workDir, "features.html");
    const featuresTextPath = path.join(paths.workDir, "features.txt");

    await fs.writeFile(featuresPath, featuresHTML, "utf8");
    await fs.writeFile(featuresTextPath, featuresHTML, "utf8");

    let jpgPaths;
    let debugMessage = "Images generated successfully.";

    try {
      const imageUrls = await searchImages(productInfo.imageSearchKeyword || `${rawProduct} product`);
      const downloadedPaths = await downloadImages(imageUrls, paths.workDir);
      jpgPaths = await convertToJPG(downloadedPaths, paths.workDir);
    } catch (imageError) {
      debugMessage = `Image generation failed: ${imageError.publicMessage || imageError.message}\nStack: ${imageError.stack}`;
      console.warn(`Image search failed, using local fallback images: ${imageError.publicMessage || imageError.message}`);
      jpgPaths = await createFallbackImages(productInfo.cleanTitle || rawProduct, paths.workDir);
    }

    const debugPath = path.join(paths.workDir, "debug.txt");
    await fs.writeFile(debugPath, debugMessage, "utf8");

    const zipPath = await createZip({
      outputPath: paths.zipPath,
      files: [
        { path: jpgPaths[0], name: "image1.jpg" },
        { path: jpgPaths[1], name: "image2.jpg" },
        { path: featuresPath, name: "features.html" },
        { path: featuresTextPath, name: "features.txt" },
        { path: debugPath, name: "debug.txt" }
      ]
    });

    res.download(zipPath, `${safeBaseName}.zip`, async (downloadErr) => {
      await cleanupJob(paths.workDir);
      await fs.remove(zipPath);
      if (downloadErr && !res.headersSent) {
        next(downloadErr);
      }
    });
  } catch (error) {
    await cleanupJob(paths.workDir);
    next(error);
  }
});

export default router;
