import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: "dist" },
  // 로컬 개발 시 /api/* 요청을 wrangler pages dev(8788)로 프록시하면
  // vite(5173)에서 Functions까지 함께 테스트할 수 있다. M1에서 활성화.
  // server: { proxy: { "/api": "http://localhost:8788" } },
});
