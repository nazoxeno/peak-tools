import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages phục vụ tại https://nazoxeno.github.io/peak-tools/
export default defineConfig({
  base: '/peak-tools/',
  build: { chunkSizeWarningLimit: 800 },
  plugins: [react()],
  define: {
    // Hiển thị ở footer: commit SHA ngắn (GitHub Actions) hoặc "dev" khi chạy local
    __APP_VERSION__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? 'dev'),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
})
