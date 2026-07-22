import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ローカルで開くだけで使えるよう、相対パス出力にする
export default defineConfig({
  base: './',
  plugins: [react()],
})
