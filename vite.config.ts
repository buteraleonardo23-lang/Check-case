import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `vite build --mode single`: demo in un unico file HTML (immagini incluse), senza service worker.
export default defineConfig(({ mode }) => {
  const single = mode === 'single'
  return {
    plugins: [
      react(),
      tailwindcss(),
      single
        ? viteSingleFile()
        : VitePWA({
            registerType: 'autoUpdate',
            manifest: {
              name: 'Check-case',
              short_name: 'Check-case',
              description: 'Checklist dei case per lo smontaggio dello spettacolo',
              lang: 'it',
              display: 'standalone',
              orientation: 'portrait',
              background_color: '#080E10',
              theme_color: '#080E10',
              icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
            },
          }),
    ],
    define: single ? {
      'import.meta.env.VITE_DEMO': JSON.stringify('true'),
      'import.meta.env.VITE_ROUTER': JSON.stringify('memory'),
    } : {},
    build: single ? { outDir: 'dist-demo', assetsInlineLimit: 100_000_000 } : {},
  }
})
