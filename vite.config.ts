import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Для превью вне Telegram: убираем внешний скрипт telegram-web-app.js
const stripTelegramScript = (): Plugin => ({
  name: 'strip-telegram-script',
  transformIndexHtml: (html) => html.replace(/\s*<!--[^>]*Telegram[^>]*-->\s*<script[^>]*telegram-web-app\.js[^>]*><\/script>/, ''),
})

export default defineConfig(({ mode }) => {
  const single = mode === 'single' // npm run build:single → один HTML-файл со всем внутри
  return {
    base: './', // работает с любого пути, в т.ч. GitHub Pages
    plugins: [react(), ...(single ? [viteSingleFile(), stripTelegramScript()] : [])],
    build: { chunkSizeWarningLimit: 1500, ...(single ? { outDir: 'dist-single' } : {}) },
    server: { host: true }, // доступ с телефона в локальной сети
  }
})
