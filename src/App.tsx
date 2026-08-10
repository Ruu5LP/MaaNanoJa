import { useMemo, useState } from 'react'
import { emptyDB, uid } from './lib/store'
import { clearLegacyLocalDB, readLegacyLocalDB } from './lib/legacy-local-data'
import type { DB, Draft, Game } from './lib/domain'
import { SYNC_LABEL, useRoomSync } from './useRoomSync'
import RecordView from './views/RecordView'
import HistoryView from './views/HistoryView'
import StatsView from './views/StatsView'
import SettingsView from './views/SettingsView'
import RoomView from './views/RoomView'
import { normalizeRoomCode, ROOM_QUERY_KEY } from './lib/cloud-room'

/** 画面から呼ぶ、DBを更新するアクション群。状態更新はここに集約する。 */
export interface Api {
  addPlayer(name: string): void
  renamePlayer(id: string, name: string): void
  removePlayer(id: string): void
  updateRules(patch: Partial<DB['rules']>): void
  addGame(game: Omit<Game, 'id'>): void
  updateGame(id: string, patch: Partial<Game>): void
  removeGame(id: string): void
  /** 進行中の半荘を設定/更新する（null で破棄）。全端末で共有される。 */
  setDraft(draft: Draft | null): void
  /** 進行中の半荘を確定保存する（games に追加し、draft を null に戻す）。 */
  commitDraft(game: Omit<Game, 'id'>): void
}

type TabId = 'record' | 'stats' | 'history' | 'settings'

const TABS: { id: TabId; label: string; ico: string }[] = [
  { id: 'record', label: '記録', ico: '🀄' },
  { id: 'stats', label: '成績', ico: '📊' },
  { id: 'history', label: '履歴', ico: '📜' },
  { id: 'settings', label: '設定', ico: '⚙️' },
]

export default function App() {
  const [db, setDB] = useState<DB>(() => emptyDB())
  const [legacyDB, setLegacyDB] = useState<DB | null>(() => readLegacyLocalDB())
  const [tab, setTab] = useState<TabId>('record')
  const [roomCode, setRoomCode] = useState<string | null>(() =>
    normalizeRoomCode(new URLSearchParams(window.location.search).get(ROOM_QUERY_KEY)),
  )

  const {
    mode: cloudMode,
    error: cloudError,
    saveState,
    saveGame,
    updateGame,
    deleteGame,
  } = useRoomSync(roomCode, setDB)

  function joinRoom(code: string) {
    const url = new URL(window.location.href)
    url.searchParams.set(ROOM_QUERY_KEY, code)
    window.history.replaceState({}, '', url)
    setRoomCode(code)
  }

  function leaveRoom() {
    const url = new URL(window.location.href)
    url.searchParams.delete(ROOM_QUERY_KEY)
    window.history.replaceState({}, '', url)
    setDB(emptyDB())
    setRoomCode(null)
  }

  const api = useMemo<Api>(
    () => ({
      addPlayer(name) {
        const nm = name.trim()
        if (!nm) return
        const next = { ...db, players: [...db.players, { id: 'p-' + uid(), name: nm }] }
        setDB(next)
        saveState(next)
      },
      renamePlayer(id, name) {
        const next = {
          ...db,
          players: db.players.map((p) => (p.id === id ? { ...p, name } : p)),
        }
        setDB(next)
        saveState(next)
      },
      removePlayer(id) {
        const next = { ...db, players: db.players.filter((p) => p.id !== id) }
        setDB(next)
        saveState(next)
      },
      updateRules(patch) {
        const next = { ...db, rules: { ...db.rules, ...patch } }
        setDB(next)
        saveState(next)
      },
      addGame(game) {
        const saved = { ...game, id: 'g-' + uid() }
        const next = { ...db, games: [...db.games, saved] }
        setDB(next)
        saveGame(saved)
      },
      updateGame(id, patch) {
        const nextGames = db.games.map((g) => (g.id === id ? { ...g, ...patch } : g))
        const next = { ...db, games: nextGames }
        setDB(next)
        const updated = nextGames.find((g) => g.id === id)
        if (updated) updateGame(updated)
      },
      removeGame(id) {
        const next = { ...db, games: db.games.filter((g) => g.id !== id) }
        setDB(next)
        deleteGame(id)
      },
      setDraft(draft) {
        const next = { ...db, draft }
        setDB(next)
        saveState(next)
      },
      commitDraft(game) {
        const saved = { ...game, id: 'g-' + uid() }
        const next = { ...db, games: [...db.games, saved], draft: null }
        setDB(next)
        saveGame(saved)
      },
    }),
    [db, deleteGame, saveGame, saveState, updateGame],
  )

  return (
    <>
      <header className="app-header">
        <h1>麻雀トラッカー</h1>
        <span className="sub">AiRuu Mahjong</span>
        <span className={`sync-badge sync-${cloudMode}`}>{SYNC_LABEL[cloudMode]}</span>
      </header>

      <RoomView
        db={db}
        legacyDB={legacyDB}
        roomCode={roomCode}
        onJoined={joinRoom}
        onLeave={leaveRoom}
        onLegacyMigrated={() => {
          clearLegacyLocalDB()
          setLegacyDB(null)
        }}
      />
      {cloudError && roomCode && <p className="sync-error">{cloudError}</p>}

      {!roomCode ? null : cloudMode === 'cloud' ? (
        <>
          {tab === 'record' && <RecordView db={db} api={api} onDone={() => setTab('history')} />}
          {tab === 'stats' && <StatsView db={db} />}
          {tab === 'history' && <HistoryView db={db} api={api} />}
          {tab === 'settings' && <SettingsView db={db} api={api} />}

          <nav className="tabbar">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={tab === t.id ? 'active' : ''}
                onClick={() => setTab(t.id)}
              >
                <span className="ico">{t.ico}</span>
                {t.label}
              </button>
            ))}
          </nav>
        </>
      ) : (
        <div className="view">
          <div className="card">
            <p className="muted">共有ルームを読み込んでいます…</p>
          </div>
        </div>
      )}
    </>
  )
}
