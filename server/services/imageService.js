import axios from "axios";
import fs from "fs-extra";
import path from "node:path";
import sharp from "sharp";

const imageClient = axios.create({
  timeout: 15000,
  responseType: "arraybuffer",
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36"
  },
  maxContentLength: 20 * 1024 * 1024
});

function publicError(message, statusCode = 502) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicMessage = message;
  return error;
}

function escapeSVG(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function searchImages(keyword) {
  if (!process.env.SERPAPI_KEY || process.env.SERPAPI_KEY === "YOUR_SERPAPI_KEY") {
    throw publicError("SERPAPI_KEY is not configured on the server.", 500);
  }

  let response;

  try {
    response = await axios.get("https://serpapi.com/search.json", {
      timeout: 15000,
      params: {
        engine: "google_images",
        q: `${keyword} product white background`,
        ijn: "0",
        api_key: process.env.SERPAPI_KEY
      }
    });
  } catch (error) {
    const status = error.response?.status || 502;
    const apiMessage = error.response?.data?.error;

    if (status === 401 || status === 403) {
      throw publicError("SerpAPI authentication failed. Check SERPAPI_KEY in server/.env.", status);
    }

    throw publicError(apiMessage ? `SerpAPI request failed: ${apiMessage}` : "SerpAPI image search request failed.", status);
  }

  if (response.data?.error) {
    throw publicError(`SerpAPI request failed: ${response.data.error}`);
  }

  const candidates = response.data?.images_results || [];
  const urls = candidates
    .map((item) => item.original || item.thumbnail)
    .filter(Boolean)
    .filter((url, index, list) => list.indexOf(url) === index)
    .slice(0, 8);

  if (urls.length < 2) {
    throw publicError("No usable product images were found.");
  }

  return urls;
}

export async function downloadImages(urls, workDir) {
  const downloaded = [];

  for (const url of urls) {
    if (downloaded.length === 2) break;

    try {
      const response = await imageClient.get(url);
      const contentType = response.headers["content-type"] || "";

      if (!contentType.startsWith("image/")) continue;

      const imagePath = path.join(workDir, `source-${downloaded.length + 1}`);
      await fs.writeFile(imagePath, response.data);
      downloaded.push(imagePath);
    } catch {
      continue;
    }
  }

  if (downloaded.length < 2) {
    throw publicError("Unable to download two usable product images.");
  }

  return downloaded;
}

export async function convertToJPG(imagePaths, workDir) {
  const outputs = [];

  for (let index = 0; index < imagePaths.length; index += 1) {
    const outputPath = path.join(workDir, `image${index + 1}.jpg`);

    try {
      await sharp(imagePaths[index], { failOn: "none" })
        .rotate()
        .resize({
          width: 1800,
          height: 1800,
          fit: "inside",
          withoutEnlargement: true
        })
        .jpeg({ quality: 90, mozjpeg: true })
        .toFile(outputPath);

      outputs.push(outputPath);
    } catch {
      throw publicError("Unsupported image format or corrupt image download.");
    }
  }

  return outputs;
}

export async function createFallbackImages(product, workDir) {
  const safeProduct = escapeSVG(product);
  const outputs = [];

  for (let index = 0; index < 2; index += 1) {
    const outputPath = path.join(workDir, `image${index + 1}.jpg`);
    const label = index === 0 ? "Product Asset" : "Sales Image";
    const svg = `
      <svg width="1200" height="1200" viewBox="0 0 1200 1200" xmlns="http://www.w3.org/2000/svg">
        <rect width="1200" height="1200" fill="#f7f5ef"/>
        <rect x="90" y="90" width="1020" height="1020" rx="22" fill="#ffffff" stroke="#d9d3c4" stroke-width="4"/>
        <text x="600" y="500" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="54" font-weight="700" fill="#202124">${safeProduct}</text>
        <text x="600" y="590" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="32" fill="#5d625f">${label}</text>
        <text x="600" y="690" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="#007a63">Replace with sourced product image when available</text>
      </svg>`;

    await sharp(Buffer.from(svg))
      .jpeg({ quality: 90, mozjpeg: true })
      .toFile(outputPath);

    outputs.push(outputPath);
  }

  return outputs;
}
