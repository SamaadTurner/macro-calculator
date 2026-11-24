/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    // Installable app that works offline: a service worker keeps a copy of every built file.
    // 'prompt' means a new version waits until the user taps Reload, so nothing reloads while
    // they are typing in the log.
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Macro Calculator',
        short_name: 'Macros',
        description: 'Daily calories and macros for your goal, a weight log, and a weekly check-in that learns what you really burn.',
        start_url: '/macro-calculator/',
        scope: '/macro-calculator/',
        display: 'standalone',
        background_color: '#F4EFE7',
        theme_color: '#F4EFE7',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // woff is only a fallback for old browsers that cannot install the app anyway.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  // GitHub Pages serves the site from /macro-calculator/
  base: '/macro-calculator/',
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'sim/**/*.test.ts'],
  },
})
