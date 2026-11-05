import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'gh-pages-cache-compat',
      closeBundle() {
        const assetsDir = path.resolve('dist/assets')
        if (!fs.existsSync(assetsDir)) return
        const files = fs.readdirSync(assetsDir)
        const mainJs = files.find((f) => /^index-[A-Za-z0-9_-]+\.js$/.test(f))
        const mainCss = files.find((f) => /^index-[A-Za-z0-9_-]+\.css$/.test(f))

        if (mainJs) {
          const jsSrc = path.join(assetsDir, mainJs)
          const legacyJsAliases = [
            'index.js',
            'index-BL7pVl4Q.js',
            'index-BckKmULU.js',
            'index-DQGjOprp.js',
            'index-C9LPrmTT.js',
            'index-DTSgAKiT.js',
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
          ]
          for (const alias of legacyCssAliases) {
            if (alias !== mainCss) {
              fs.copyFileSync(cssSrc, path.join(assetsDir, alias))
            }
          }
        }
      },
    },
  ],
})
