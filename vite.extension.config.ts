import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  root: resolve(__dirname, 'extension'),
  publicDir: resolve(__dirname, 'extension/public'),
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, 'dist-extension'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        panel: resolve(__dirname, 'extension/panel.html'),
        background: resolve(__dirname, 'extension/src/background.ts'),
        content: resolve(__dirname, 'extension/src/content.ts'),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'background') return 'background.js'
          if (chunk.name === 'content') return 'content.js'
          return 'assets/[name]-[hash].js'
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
