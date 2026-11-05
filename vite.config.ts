import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/index.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'gh-pages-cache-compat',
      closeBundle() {
        const distDir = path.resolve('dist')
        const assetsDir = path.resolve('dist/assets')
        if (!fs.existsSync(assetsDir)) return
        const files = fs.readdirSync(assetsDir)
        const mainJs =
          files.find((f) => f === 'index.js') ||
          files.find((f) => /^index-[A-Za-z0-9_-]+\.js$/.test(f))
        const mainCss =
          files.find((f) => f === 'index.css') ||
          files.find((f) => /^index-[A-Za-z0-9_-]+\.css$/.test(f))

        if (mainJs) {
          const jsSrc = path.join(assetsDir, mainJs)
          const legacyJsAliases = [
            'index.js',
            'index-BL7pVl4Q.js',
            'index-BckKmULU.js',
            'index-DQGjOprp.js',
            'index-C9LPrmTT.js',
            'index-DTSgAKiT.js',
            'index-BF0GLhH0.js',
            'index-DJQ5NQwg.js',
          ]
          for (const alias of legacyJsAliases) {
            if (alias !== mainJs) {
              fs.copyFileSync(jsSrc, path.join(assetsDir, alias))
            }
          }
        }

        if (mainCss) {
          const cssSrc = path.join(assetsDir, mainCss)
          const legacyCssAliases = [
            'index.css',
            'index-DtRCcDfu.css',
            'index-C1I_OvpS.css',
            'index-CQ5dvoCQ.css',
            'index-9hB4a8ra.css',
            'index-DeQM3_jl.css',
            'index-W0PUaJc_.css',
            'index-CDORvkhY.css',
          ]
          for (const alias of legacyCssAliases) {
            if (alias !== mainCss) {
              fs.copyFileSync(cssSrc, path.join(assetsDir, alias))
            }
          }
        }

        // Add cache-busting query string to index.html references so fresh HTML always loads latest assets
        const indexHtmlPath = path.join(distDir, 'index.html')
        if (fs.existsSync(indexHtmlPath)) {
          const versionTag = Date.now().toString(36)
          let html = fs.readFileSync(indexHtmlPath, 'utf-8')
          html = html
            .replace(/src="\.\/assets\/index\.js"/g, `src="./assets/index.js?v=${versionTag}"`)
            .replace(/href="\.\/assets\/index\.css"/g, `href="./assets/index.css?v=${versionTag}"`)
          fs.writeFileSync(indexHtmlPath, html, 'utf-8')
        }
      },
    },
  ],
})
