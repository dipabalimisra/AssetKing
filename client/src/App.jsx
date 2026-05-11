import React, { useMemo, useState } from "react";
import { generateProductAssets } from "./services/api.js";

function filenameFromProduct(product) {
  const safeName = product
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `${safeName || "product-assets"}.zip`;
}

async function getErrorMessage(error) {
  const stringifyMessage = (value) => {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (typeof value.message === "string") return value.message;
    if (typeof value.error === "string") return value.error;
    if (value.error && typeof value.error.message === "string") return value.error.message;
    if (typeof value.code === "string") return `${value.code}: ${value.message || "Generation failed."}`;
    return JSON.stringify(value);
  };

  if (error.response?.data instanceof Blob) {
    try {
      const text = await error.response.data.text();
      if (!text) return "Generation failed. The server returned an empty error response.";

      try {
        const parsed = JSON.parse(text);
        return stringifyMessage(parsed.error || parsed);
      } catch {
        return text;
      }
    } catch {
      return "Generation failed. Check your server keys and try again.";
    }
  }

  return stringifyMessage(error.response?.data?.error || error.response?.data || error.message) || "Generation failed.";
}

export default function App() {
  const [product, setProduct] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  const canSubmit = useMemo(() => product.trim().length > 1 && status !== "loading", [product, status]);

  async function handleSubmit(event) {
    event.preventDefault();
    const productName = product.trim();

    if (!productName) return;

    setStatus("loading");
    setError("");

    try {
      const response = await generateProductAssets(productName);
      const url = window.URL.createObjectURL(new Blob([response.data], { type: "application/zip" }));
      const link = document.createElement("a");

      link.href = url;
      link.setAttribute("download", filenameFromProduct(productName));
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setStatus("success");
    } catch (err) {
      setError(await getErrorMessage(err));
      setStatus("error");
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f5ef] text-[#202124]">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-5 py-10">
        <div className="mb-10">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#007a63]">AssetKing</p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">
            AI product sales asset generator
          </h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-[#5d625f]">
            Enter a product name and download a ZIP containing two JPG product images plus ready-to-use ecommerce
            feature HTML.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-lg border border-[#d9d3c4] bg-white p-5 shadow-sm">
          <label htmlFor="product" className="text-sm font-semibold text-[#343735]">
            Product name
          </label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              id="product"
              value={product}
              onChange={(event) => setProduct(event.target.value)}
              placeholder="Murray MT100 Riding Lawn Tractor"
              className="min-h-12 flex-1 rounded-md border border-[#c9c3b6] px-4 text-base outline-none transition focus:border-[#007a63] focus:ring-4 focus:ring-[#007a63]/15"
            />
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex min-h-12 items-center justify-center rounded-md bg-[#007a63] px-6 font-semibold text-white transition hover:bg-[#00624f] disabled:cursor-not-allowed disabled:bg-[#98aaa4]"
            >
              {status === "loading" ? (
                <span className="flex items-center gap-3">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Generating
                </span>
              ) : (
                "Generate ZIP"
              )}
            </button>
          </div>

          <div className="mt-4 min-h-6 text-sm">
            {status === "loading" && <p className="text-[#5d625f]">Researching, converting images, and packaging ZIP.</p>}
            {status === "success" && <p className="font-medium text-[#007a63]">ZIP download started.</p>}
            {status === "error" && <p className="font-medium text-[#b42318]">{error}</p>}
          </div>
        </form>
      </section>
    </main>
  );
}
