import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'

import { VitePWA } from 'vite-plugin-pwa'

const mockSupabasePath = fileURLToPath(new URL('./src/__mocks__/supabaseClient.js', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt', // Changed to prompt to allow UI update banner
      includeAssets: ['icon.png', 'logo.png', 'worship-background.png'],
      manifest: {
        name: 'LouvorPlay',
        short_name: 'LouvorPlay',
        description: 'Gerenciador de repertórios e cifras para ministérios de louvor',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/dashboard',
        scope: '/',
        icons: [
          {
            src: 'icon.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icon.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10MB
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api/bible': {
        target: 'https://www.abibliadigital.com.br/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/bible/, '')
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './vitest.setup.js',
    alias: [
      { find: /^(\.\.\/)+supabaseClient$/, replacement: mockSupabasePath },
      { find: /^(\.\/)+supabaseClient$/, replacement: mockSupabasePath }
    ],
    include: ['src/**/*.{test,spec}.{js,jsx}'],
  }
})
