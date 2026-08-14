import { useCallback, useEffect, useMemo, useState } from 'react'
import { emptyDB, uid } from './lib/store'
import { clearLegacyLocalDB, readLegacyLocalDB } from './lib/legacy-local-data'
import type { DB, Draft, Game } from './lib/domain'
import { fetchAccount, fetchMyRooms } from './lib/account-api'
import {
  CloudRoomError,
  createRoom,
  deleteRoom as deleteCloudRoom,
  leaveRoom as leaveCloudRoom,
} from './lib/cloud-room-api'
import { GOOGLE_LOGIN_PATH, type AccountRoom, type AccountState } from './lib/account'
import { clearGuestSessionDB, readGuestSessionDB, writeGuestSessionDB } from './lib/guest-session'
import { prepareInitialPlayers } from './lib/initial-players'
import { SYNC_LABEL, type SyncStatus, useRoomSync } from './useRoomSync'
import RecordView from './views/RecordView'
import HistoryView from './views/HistoryView'
import StatsView from './views/StatsView'
import SettingsView from './views/SettingsView'
import RoomView from './views/RoomView'
import LandingView from './views/LandingView'
import RoomAccessView from './views/RoomAccessView'
import { normalizeRoomCode, ROOM_QUERY_KEY } from './lib/cloud-room'
import AppHeader from './components/AppHeader'
import { useRoomAccess } from './useRoomAccess'

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
  const [guestDB, setGuestDB] = useState<DB | null>(() => readGuestSessionDB())
  const [guestMode, setGuestMode] = useState(false)
  const [guestSaveBusy, setGuestSaveBusy] = useState(false)
  const [guestSaveError, setGuestSaveError] = useState<string | null>(null)
  const [account, setAccount] = useState<AccountState | null>(null)
  const [accountRooms, setAccountRooms] = useState<AccountRoom[]>([])
  const [accountError, setAccountError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>('record')
  const initialRoomCode = normalizeRoomCode(
    new URLSearchParams(window.location.search).get(ROOM_QUERY_KEY),
  )
  const [roomCode, setRoomCode] = useState<string | null>(initialRoomCode)
  const {
    access: roomAccess,
    isReady: roomAccessReady,
    joinPendingRoom,
    retry: retryRoomAccess,
  } = useRoomAccess(roomCode, account, accountError)
  const roomReady = roomAccessReady

  const setAppDB = useCallback(
    (next: DB) => {
      setDB(next)
      if (guestMode) {
        writeGuestSessionDB(next)
        setGuestDB(next)
      }
    },
    [guestMode],
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
  } = useRoomSync(roomReady ? roomCode : null, setAppDB)

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

  const joinRoom = useCallback((code: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set(ROOM_QUERY_KEY, code)
    window.history.replaceState({}, '', url)
    setGuestMode(false)
    setGuestSaveError(null)
    setRoomCode(code)
  }, [])

  const goHome = useCallback(() => {
    const url = new URL(window.location.href)
    url.pathname = '/'
    url.searchParams.delete(ROOM_QUERY_KEY)
    url.searchParams.delete('board')
    window.history.replaceState({}, '', url)
    setDB(emptyDB())
    setGuestMode(false)
    setGuestSaveError(null)
    setRoomCode(null)
    setTab('record')
  }, [])

  const startGuest = useCallback(() => {
    const next = prepareInitialPlayers(guestDB ?? emptyDB())
    setDB(next)
    writeGuestSessionDB(next)
    setGuestDB(next)
    setGuestMode(true)
    setGuestSaveError(null)
    setTab('record')
  }, [guestDB])

  const loginUrl = useMemo(() => {
    const current = `${window.location.pathname}${window.location.search}`
    return `${GOOGLE_LOGIN_PATH}?returnTo=${encodeURIComponent(current)}`
  }, [])

  const saveGuestToCloud = useCallback(async () => {
    if (!guestDB) return
    if (!account?.user) {
      setGuestSaveError('保存するにはGoogleでログインしてください')
      return
    }

    setGuestSaveBusy(true)
    setGuestSaveError(null)
    try {
      // ゲスト画面を離れた後も、移行元は現在の空DBではなく保存済みのguestDBを使う。
      const created = await createRoom(guestDB, { migrateGames: true })
      clearGuestSessionDB()
      setGuestDB(null)
      setGuestMode(false)
      joinRoom(created.roomCode)
      await refreshAccount()
    } catch (error) {
      setGuestSaveError(
        error instanceof CloudRoomError ? error.message : 'データを保存できませんでした',
      )
    } finally {
      setGuestSaveBusy(false)
    }
  }, [account?.user, guestDB, joinRoom, refreshAccount])

  const restoreDB = useCallback(
    async (imported: DB) => {
      if (guestMode && !account?.user) {
        throw new Error('JSONから共有ルームを作るには、先にGoogleでログインしてください')
      }
      const created = await createRoom(imported, { migrateGames: true })
      if (guestMode) {
        clearGuestSessionDB()
        setGuestDB(null)
        setGuestMode(false)
      }
      joinRoom(created.roomCode)
      await refreshAccount()
    },
    [account?.user, guestMode, joinRoom, refreshAccount],
  )

  const deleteCurrentRoom = useCallback(async () => {
    if (!roomCode) throw new Error('削除するルームが選択されていません')
    await deleteCloudRoom(roomCode)
    goHome()
    await refreshAccount()
  }, [goHome, refreshAccount, roomCode])

  const leaveCurrentRoom = useCallback(async () => {
    if (!roomCode) throw new Error('退出するルームが選択されていません')
    await leaveCloudRoom(roomCode)
    goHome()
    await refreshAccount()
  }, [goHome, refreshAccount, roomCode])

  const currentRoom = roomCode ? accountRooms.find((room) => room.roomCode === roomCode) : undefined
  const canDeleteRoom = currentRoom?.role === 'owner'
  const canLeaveRoom = currentRoom?.role === 'member'

  const api = useMemo<Api>(
    () => ({
      addPlayer(name) {
        const nm = name.trim()
        if (!nm || db.players.length >= 4) return
        const previous = db
        const next = { ...db, players: [...db.players, { id: 'p-' + uid(), name: nm }] }
        setAppDB(next)
        saveState(next, previous)
      },
      renamePlayer(id, name) {
        const previous = db
        const next = {
          ...db,
          players: db.players.map((p) => (p.id === id ? { ...p, name } : p)),
        }
        setAppDB(next)
        saveState(next, previous)
      },
      removePlayer(id) {
        const previous = db
        const next = { ...db, players: db.players.filter((p) => p.id !== id) }
        setAppDB(next)
        saveState(next, previous)
      },
      updateRules(rules) {
        const previous = db
        const next = { ...db, rules }
        setAppDB(next)
        saveState(next, previous)
      },
      addGame(game) {
        const saved = { ...game, id: 'g-' + uid() }
        const previous = db
        const next = { ...db, games: [...db.games, saved] }
        setAppDB(next)
        saveGame(saved, next, previous)
      },
      updateGame(id, patch) {
        const nextGames = db.games.map((g) => (g.id === id ? { ...g, ...patch } : g))
        const previous = db
        const next = { ...db, games: nextGames }
        setAppDB(next)
        const updated = nextGames.find((g) => g.id === id)
        if (updated) updateGame(updated, next, previous)
      },
      removeGame(id) {
        const previous = db
        const next = { ...db, games: db.games.filter((g) => g.id !== id) }
        setAppDB(next)
        deleteGame(id, next, previous)
      },
      setDraft(draft) {
        const previous = db
        const next = { ...db, draft }
        setAppDB(next)
        saveState(next, previous)
      },
      commitDraft(game) {
        const saved = { ...game, id: 'g-' + uid() }
        const previous = db
        const next = { ...db, games: [...db.games, saved], draft: null }
        setAppDB(next)
        saveGame(saved, next, previous)
      },
    }),
    [db, deleteGame, saveGame, saveState, setAppDB, updateGame],
  )

  return (
    <>
      <AppHeader
        account={account}
        accountError={accountError}
        guestMode={guestMode}
        roomCode={roomReady ? roomCode : null}
        syncStatus={roomReady ? syncStatus : null}
        syncLabel={roomReady ? syncStatusLabel(syncStatus, cloudMode) : undefined}
        onHome={goHome}
        onRetryAccount={() => void refreshAccount()}
      />

      {roomCode && !roomReady ? (
        <RoomAccessView
          roomCode={roomCode}
          status={roomAccess.status === 'ready' ? 'checking' : roomAccess.status}
          ownerDisplayName={roomAccess.ownerDisplayName}
          loginUrl={loginUrl}
          error={roomAccess.error}
          onJoin={() => void joinPendingRoom()}
          onBack={goHome}
          onRetry={() => {
            retryRoomAccess()
            void refreshAccount()
          }}
        />
      ) : roomCode ? (
        <RoomView roomCode={roomCode} onLeave={goHome} />
      ) : guestMode ? (
        <div className="guest-strip">
          <span className="room-label">ゲストモード</span>
          <span className="guest-strip-message">
            このタブに一時保存中です。タブを閉じると消えます。Googleログインで共有ルームへ保存できます。
          </span>
          <span className="spacer" />
          {account?.user ? (
            <button
              className="btn sm primary"
              disabled={guestSaveBusy}
              onClick={() => void saveGuestToCloud()}
            >
              {guestSaveBusy ? '保存中…' : '共有ルームに保存'}
            </button>
          ) : account?.loginEnabled ? (
            <a className="btn sm primary auth-action" href={loginUrl}>
              Googleログインして保存
            </a>
          ) : (
            <span className="muted guest-login-unavailable">
              残すにはGoogleでログインしてください
            </span>
          )}
          <button
            className="btn sm ghost"
            onClick={() => {
              setGuestMode(false)
              setDB(emptyDB())
            }}
          >
            トップへ戻る
          </button>
        </div>
      ) : (
        <LandingView
          db={db}
          legacyDB={legacyDB}
          guestDB={guestDB}
          guestMigrationBusy={guestSaveBusy}
          account={account}
          accountRooms={accountRooms}
          accountError={accountError}
          onJoined={joinRoom}
          onStartGuest={startGuest}
          onMigrateGuest={() => void saveGuestToCloud()}
          onAccountChanged={() => void refreshAccount()}
          onLegacyMigrated={() => {
            clearLegacyLocalDB()
            setLegacyDB(null)
          }}
        />
      )}
      {cloudError && roomReady && (
        <div className="sync-error-row" role="alert">
          <span>{cloudError}</span>
          <button className="btn sm ghost" onClick={retrySync}>
            再接続
          </button>
        </div>
      )}
      {syncNotice && roomReady && (
        <p className="sync-notice" role="status">
          {syncNoticeLabel(syncNotice, lastSyncedAt)}
        </p>
      )}

      {guestSaveError && (guestMode || guestDB) && (
        <p className="error-text guest-save-error" role="alert">
          {guestSaveError}
        </p>
      )}

      {guestMode || roomReady ? (
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
          {tab === 'settings' && (
            <SettingsView
              db={db}
              api={api}
              onRestore={restoreDB}
              guestMode={guestMode}
              canDeleteRoom={canDeleteRoom}
              onDeleteRoom={deleteCurrentRoom}
              canLeaveRoom={canLeaveRoom}
              onLeaveRoom={leaveCurrentRoom}
            />
          )}

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
      ) : null}
    </>
  )
}
