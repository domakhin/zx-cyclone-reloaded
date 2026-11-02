import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // Project Pages URL: https://domakhin.github.io/zx-cyclone-reloaded/
  base: '/zx-cyclone-reloaded/',
  plugins: [react(), tailwindcss()],
})
