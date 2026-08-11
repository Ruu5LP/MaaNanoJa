import { useCallback, useEffect, useMemo, useState } from 'react'
import { emptyDB, uid } from './lib/store'
import { clearLegacyLocalDB, readLegacyLocalDB } from './lib/legacy-local-data'
import type { DB, Draft, Game } from './lib/domain'
import { fetchAccount, fetchMyRooms } from './lib/account-api'
import { createRoom } from './lib/cloud-room-api'
import type { AccountRoom, AccountState } from './lib/account'
import { SYNC_LABEL, type SyncStatus, useRoomSync } from './useRoomSync'
import RecordView from './views/RecordView'
import HistoryView from './views/HistoryView'
import StatsView from './views/StatsView'
import SettingsView from './views/SettingsView'
import RoomView from './views/RoomView'
import LandingView from './views/LandingView'
import { normalizeRoomCode, ROOM_QUERY_KEY } from './lib/cloud-room'

/** 画面から呼ぶ、DBを更新するアクション群。状態更新はここに集約する。 */
export interface Api {
  addPlayer(name: string): void
  renamePlayer(id: string, name: string): void
  removePlayer(id: string): void
  updateRules(rules: DB['rules']): void
  addGame(game: Omit<Game, 'id'>): void
  updateGame(id: string, patch: Partial<Game>): void
  removeGame(id: string): void
  /** 進行中の半荘を設定/更新する（null で破棄）。全端末で共有される。 */
  setDraft(draft: Draft | null): void
  /** 進行中の半荘を確定保存する（games に追加し、draft を null に戻す）。 */
  commitDraft(game: Omit<Game, 'id'>): void
}

type TabId = 'record' | 'stats' | 'history' | 'settings'

function syncStatusLabel(status: SyncStatus, mode: 'idle' | 'connecting' | 'cloud'): string {
  if (status === 'saving') return '☁️ 保存中…'
  if (status === 'error') return '⚠️ 同期エラー'
  if (status === 'connecting') return SYNC_LABEL.connecting
  if (status === 'synced') return '☁️ 保存済み'
  return SYNC_LABEL[mode]
}

function syncNoticeLabel(notice: string, lastSyncedAt: number | null): string {
  if (!lastSyncedAt) return notice
  const time = new Date(lastSyncedAt).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  return `${notice}（${time}）`
}

const TABS: { id: TabId; label: string; ico: string }[] = [
  { id: 'record', label: '記録', ico: '🀄' },
  { id: 'stats', label: '成績', ico: '📊' },
  { id: 'history', label: '履歴', ico: '📜' },
  { id: 'settings', label: '設定', ico: '⚙️' },
]

export default function App() {
  const [db, setDB] = useState<DB>(() => emptyDB())
  const [legacyDB, setLegacyDB] = useState<DB | null>(() => readLegacyLocalDB())
  const [account, setAccount] = useState<AccountState | null>(null)
  const [accountRooms, setAccountRooms] = useState<AccountRoom[]>([])
  const [accountError, setAccountError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>('record')
  const [roomCode, setRoomCode] = useState<string | null>(() =>
    normalizeRoomCode(new URLSearchParams(window.location.search).get(ROOM_QUERY_KEY)),
  )

  const {
    mode: cloudMode,
    status: syncStatus,
    error: cloudError,
    notice: syncNotice,
    lastSyncedAt,
    retry: retrySync,
    saveState,
    saveGame,
    updateGame,
    deleteGame,
  } = useRoomSync(roomCode, setDB)

  const refreshAccount = useCallback(async () => {
    try {
      const next = await fetchAccount()
      setAccount(next)
      if (next.authenticated) {
        setAccountRooms(await fetchMyRooms())
      } else {
        setAccountRooms([])
      }
      setAccountError(null)
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'アカウント情報を取得できません')
    }
  }, [])

  useEffect(() => {
    void refreshAccount()
  }, [refreshAccount])

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

  const restoreDB = useCallback(
    async (imported: DB) => {
      const created = await createRoom(imported, { migrateGames: true })
      joinRoom(created.roomCode)
      await refreshAccount()
    },
    [refreshAccount],
  )

  const api = useMemo<Api>(
    () => ({
      addPlayer(name) {
        const nm = name.trim()
        if (!nm || db.players.length >= 4) return
        const previous = db
        const next = { ...db, players: [...db.players, { id: 'p-' + uid(), name: nm }] }
        setDB(next)
        saveState(next, previous)
      },
      renamePlayer(id, name) {
        const previous = db
        const next = {
          ...db,
          players: db.players.map((p) => (p.id === id ? { ...p, name } : p)),
        }
        setDB(next)
        saveState(next, previous)
      },
      removePlayer(id) {
        const previous = db
        const next = { ...db, players: db.players.filter((p) => p.id !== id) }
        setDB(next)
        saveState(next, previous)
      },
      updateRules(rules) {
        const previous = db
        const next = { ...db, rules }
        setDB(next)
        saveState(next, previous)
      },
      addGame(game) {
        const saved = { ...game, id: 'g-' + uid() }
        const previous = db
        const next = { ...db, games: [...db.games, saved] }
        setDB(next)
        saveGame(saved, next, previous)
      },
      updateGame(id, patch) {
        const nextGames = db.games.map((g) => (g.id === id ? { ...g, ...patch } : g))
        const previous = db
        const next = { ...db, games: nextGames }
        setDB(next)
        const updated = nextGames.find((g) => g.id === id)
        if (updated) updateGame(updated, next, previous)
      },
      removeGame(id) {
        const previous = db
        const next = { ...db, games: db.games.filter((g) => g.id !== id) }
        setDB(next)
        deleteGame(id, next, previous)
      },
      setDraft(draft) {
        const previous = db
        const next = { ...db, draft }
        setDB(next)
        saveState(next, previous)
      },
      commitDraft(game) {
        const saved = { ...game, id: 'g-' + uid() }
        const previous = db
        const next = { ...db, games: [...db.games, saved], draft: null }
        setDB(next)
        saveGame(saved, next, previous)
      },
    }),
    [db, deleteGame, saveGame, saveState, updateGame],
  )

  return (
    <>
      <header className="app-header">
        <h1>麻雀トラッカー</h1>
        {account?.user && <span className="account-badge">👤 {account.user.displayName}</span>}
        {roomCode && (
          <span className={`sync-badge sync-${syncStatus}`} role="status">
            {syncStatusLabel(syncStatus, cloudMode)}
          </span>
        )}
      </header>

      {roomCode ? (
        <RoomView account={account} roomCode={roomCode} onLeave={leaveRoom} />
      ) : (
        <LandingView
          db={db}
          legacyDB={legacyDB}
          account={account}
          accountRooms={accountRooms}
          accountError={accountError}
          onJoined={joinRoom}
          onAccountChanged={() => void refreshAccount()}
          onLegacyMigrated={() => {
            clearLegacyLocalDB()
            setLegacyDB(null)
          }}
        />
      )}
      {cloudError && roomCode && (
        <div className="sync-error-row" role="alert">
          <span>{cloudError}</span>
          <button className="btn sm ghost" onClick={retrySync}>
            再接続
          </button>
        </div>
      )}
      {syncNotice && roomCode && (
        <p className="sync-notice" role="status">
          {syncNoticeLabel(syncNotice, lastSyncedAt)}
        </p>
      )}

      {!roomCode ? null : cloudMode === 'cloud' ? (
        <>
          {tab === 'record' && (
            <RecordView
              db={db}
              api={api}
              onDone={() => setTab('history')}
              onOpenSettings={() => setTab('settings')}
            />
          )}
          {tab === 'stats' && <StatsView db={db} />}
          {tab === 'history' && <HistoryView db={db} api={api} />}
          {tab === 'settings' && <SettingsView db={db} api={api} onRestore={restoreDB} />}

          <nav className="tabbar">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={tab === t.id ? 'active' : ''}
                aria-current={tab === t.id ? 'page' : undefined}
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
