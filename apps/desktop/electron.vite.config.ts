import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Strict CSP is injected into production builds only (Vite's dev server needs inline HMR scripts).
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
  "font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'"
const cspPlugin = {
  name: 'pc-doctor-csp',
  transformIndexHtml(html: string) {
    return html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`)
  }
}

export default defineConfig({
  main: {
    build: {
      rollupOptions: { input: resolve(__dirname, 'electron/main/index.ts') }
    }
  },
  preload: {
    build: {
      rollupOptions: { input: resolve(__dirname, 'electron/preload/index.ts') }
    }
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: { input: resolve(__dirname, 'index.html') }
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    plugins: [react(), tailwindcss(), cspPlugin]
  }
})
