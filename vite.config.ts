import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { jwHubApiPlugin } from './server/vite-plugin-api.ts'

export default defineConfig({
  plugins: [react(), tailwindcss(), jwHubApiPlugin()],
  server: {
    port: 5173,
    host: true,
  },
})
