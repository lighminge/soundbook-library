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
            'index-HZDSf_Ms.js',
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

        // Inline CSS and JS directly into dist/index.html so index.html is 100% self-contained
        // and never suffers from GitHub Pages CDN HTML/asset cache mismatch or extra TCP connection resets
        const indexHtmlPath = path.join(distDir, 'index.html')
        if (fs.existsSync(indexHtmlPath) && mainJs && mainCss) {
          const jsContent = fs
            .readFileSync(path.join(assetsDir, mainJs), 'utf-8')
            .replace(/<\/script/gi, '<\\/script')
          const cssContent = fs
            .readFileSync(path.join(assetsDir, mainCss), 'utf-8')
            .replace(/<\/style/gi, '<\\/style')

          let html = fs.readFileSync(indexHtmlPath, 'utf-8')
          html = html.replace(
            /<link\s+rel="stylesheet"[^>]*href="\.\/assets\/[^"]+\.css"[^>]*>/i,
            () => `<style>${cssContent}</style>`
          )
          html = html.replace(
            /<script\s+type="module"[^>]*src="\.\/assets\/[^"]+\.js"[^>]*><\/script>/i,
            () => `<script type="module">${jsContent}</script>`
          )
          fs.writeFileSync(indexHtmlPath, html, 'utf-8')
        }
      },
    },
  ],
})
