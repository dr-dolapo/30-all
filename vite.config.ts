import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Every production build gets its own id: commit + build time. It's baked into the bundle and
// published as /version.json, so open tabs can tell when a newer release is live (src/version.ts).
function buildId() {
  let sha = process.env.WORKERS_CI_COMMIT_SHA ?? "";
  if (!sha) try { sha = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { /* not a git checkout */ }
  return `${sha.slice(0, 10) || "local"}-${Date.now().toString(36)}`;
}

// `npm run dev` serves the React app on :5173 and forwards /api to `wrangler dev` on :8787.
export default defineConfig(({ command }) => {
  const id = command === "build" ? buildId() : "dev";
  return {
    plugins: [
      react(),
      { name: "version-json", apply: "build", generateBundle() { this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: id }) }); } },
    ],
    define: { __BUILD_ID__: JSON.stringify(id) },
    server: {
      proxy: { "/api": "http://localhost:8787" },
    },
    test: {
      include: ["shared/**/*.test.ts"],
    },
  } as any;
});
