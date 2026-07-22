/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ローカルで開くだけで使えるよう、相対パス出力にする（base: './'）。
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    // lib/ の純粋ロジックはブラウザ非依存。node環境でテストする。
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
