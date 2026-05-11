import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000"
});

export async function generateProductAssets(product) {
  return api.post(
    "/generate",
    { product },
    {
      responseType: "blob",
      timeout: 120000
    }
  );
}
