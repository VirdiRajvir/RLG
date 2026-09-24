import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // frontend/ has its own package-lock.json, so Vite infers the workspace root
    // as frontend/ and refuses to serve anything above it. The study components
    // import shared constants from ../../api/_lib/prolificAssignment.js (a single
    // source of truth shared with the API handlers), which lives one level up —
    // without this the dev server 403s on that module. `vite build` is unaffected
    // either way; this is a dev-server-only restriction.
    fs: { allow: ['..'] },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
