import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import BoardApp from './BoardApp'
import LegalView from './views/LegalView'
import AppErrorBoundary from './components/AppErrorBoundary'
import './styles.css'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root が見つかりません')

// ?board=1 で開くと、タブUIの代わりに全画面スコアボード（モニター表示用）を描画する。
// サーバ側のルーティング変更は不要（クエリparamだけなので通常の "/" と同じ扱い）。
const isBoard = new URLSearchParams(window.location.search).get('board') === '1'
const legalPage =
  window.location.pathname === '/privacy'
    ? 'privacy'
    : window.location.pathname === '/terms'
      ? 'terms'
      : null

createRoot(rootEl).render(
  <React.StrictMode>
    <AppErrorBoundary>
      {isBoard ? <BoardApp /> : legalPage ? <LegalView page={legalPage} /> : <App />}
    </AppErrorBoundary>
  </React.StrictMode>,
)
