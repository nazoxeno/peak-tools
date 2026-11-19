import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages phục vụ tại https://nazoxeno.github.io/peak-tools/
export default defineConfig({
  base: '/peak-tools/',
  build: { chunkSizeWarningLimit: 800 },
  plugins: [react()],
})
