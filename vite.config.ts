import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `npm run dev` serves the React app on :5173 and forwards /api to `wrangler dev` on :8787.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": "http://localhost:8787" },
  },
  test: {
    include: ["shared/**/*.test.ts"],
  },
} as any);
