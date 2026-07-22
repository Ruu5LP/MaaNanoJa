import { useEffect, useMemo, useState } from 'react'
import { loadDB, saveDB, normalizeDB, uid } from './lib/store'
import type { DB, Game } from './lib/domain'
import RecordView from './views/RecordView'
import HistoryView from './views/HistoryView'
import StatsView from './views/StatsView'
import SettingsView from './views/SettingsView'

/** 画面から呼ぶ、DBを更新するアクション群。状態更新はここに集約する。 */
export interface Api {
  addPlayer(name: string): void
  renamePlayer(id: string, name: string): void
  removePlayer(id: string): void
  updateRules(patch: Partial<DB['rules']>): void
  addGame(game: Omit<Game, 'id'>): void
  updateGame(id: string, patch: Partial<Game>): void
  removeGame(id: string): void
  replaceDB(next: unknown): void
}

type TabId = 'record' | 'stats' | 'history' | 'settings'

const TABS: { id: TabId; label: string; ico: string }[] = [
  { id: 'record', label: '記録', ico: '🀄' },
  { id: 'stats', label: '成績', ico: '📊' },
  { id: 'history', label: '履歴', ico: '📜' },
  { id: 'settings', label: '設定', ico: '⚙️' },
]

export default function App() {
  const [db, setDB] = useState<DB>(() => loadDB())
  const [tab, setTab] = useState<TabId>('record')

  useEffect(() => {
    saveDB(db)
  }, [db])

  const api = useMemo<Api>(
    () => ({
      addPlayer(name) {
        const nm = name.trim()
        if (!nm) return
        setDB((d) => ({ ...d, players: [...d.players, { id: 'p-' + uid(), name: nm }] }))
      },
      renamePlayer(id, name) {
        setDB((d) => ({
          ...d,
          players: d.players.map((p) => (p.id === id ? { ...p, name } : p)),
        }))
      },
      removePlayer(id) {
        setDB((d) => ({ ...d, players: d.players.filter((p) => p.id !== id) }))
      },
      updateRules(patch) {
        setDB((d) => ({ ...d, rules: { ...d.rules, ...patch } }))
      },
      addGame(game) {
        setDB((d) => ({ ...d, games: [...d.games, { ...game, id: 'g-' + uid() }] }))
      },
      updateGame(id, patch) {
        setDB((d) => ({
          ...d,
          games: d.games.map((g) => (g.id === id ? { ...g, ...patch } : g)),
        }))
      },
      removeGame(id) {
        setDB((d) => ({ ...d, games: d.games.filter((g) => g.id !== id) }))
      },
      replaceDB(next) {
        setDB(normalizeDB(next))
      },
    }),
    [],
  )

  return (
    <>
      <header className="app-header">
        <h1>麻雀トラッカー</h1>
        <span className="sub">AiRuu Mahjong</span>
      </header>

      {tab === 'record' && <RecordView db={db} api={api} onDone={() => setTab('history')} />}
      {tab === 'stats' && <StatsView db={db} />}
      {tab === 'history' && <HistoryView db={db} api={api} />}
      {tab === 'settings' && <SettingsView db={db} api={api} />}

      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            <span className="ico">{t.ico}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </>
  )
}
