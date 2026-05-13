# AssetKing

AI product sales asset generator that creates a ZIP containing:

- `image1.jpg`
- `image2.jpg`
- `features.html`
- `features.txt`

## Setup

```bash
npm run install:all
```

Create `server/.env` from `server/.env.example`:

```bash
AI_PROVIDER=template
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash-lite
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
SERPAPI_KEY=043f0e04d9c8df516eac30b0cecb93c06a6fcdcc682da7bfa409b9652ed8948e
PORT=5000
```

`AI_PROVIDER=template` does not call a paid AI API. Use `gemini`, `ollama`, `openai`, or `auto` later if you want AI-written bullets.

## Run

```bash
npm run dev
```

Client: `http://localhost:5173`

Server: `http://localhost:5000`

## Deploy To Vercel

This repo is Vercel-ready. The React app is built from `client/`, and the Express generator runs through Vercel Functions at `/api/generate`.

No paid AI key is required when using:

```bash
AI_PROVIDER=template
```

If no `SERPAPI_KEY` is configured, the ZIP still downloads with local fallback JPGs and raw HTML in `features.html` plus `features.txt`.
