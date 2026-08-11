import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addRoomGame,
  CloudRoomError,
  deleteRoomGame,
  fetchRoom,
  updateRoomGame,
  updateRoomState,
} from './lib/cloud-room-api'
import { toRoomState, type RoomSnapshot } from './lib/cloud-room'
import type { DB, Game } from './lib/domain'
import { emptyDB, normalizeDB, SCHEMA_VERSION } from './lib/store'

export type SyncMode = 'idle' | 'connecting' | 'cloud'
export type SyncStatus = 'idle' | 'connecting' | 'saving' | 'synced' | 'error'

export const SYNC_LABEL: Record<SyncMode, string> = {
  idle: '☁️ ルーム未選択',
  connecting: '☁️ 接続中…',
  cloud: '☁️ クラウド同期中',
}

interface RoomSyncResult {
  mode: SyncMode
  status: SyncStatus
  error: string | null
  notice: string | null
  lastSyncedAt: number | null
  retry(): void
  saveState(nextDB: DB, rollbackDB: DB): void
  saveGame(game: Game, nextDB: DB, rollbackDB: DB): void
  updateGame(game: Game, nextDB: DB, rollbackDB: DB): void
  deleteGame(gameId: string, nextDB: DB, rollbackDB: DB): void
}

function snapshotDB(snapshot: RoomSnapshot): DB {
  return normalizeDB({
    version: SCHEMA_VERSION,
    players: snapshot.state.players,
    rules: snapshot.state.rules,
    draft: snapshot.state.draft,
    games: snapshot.games,
  })
}

function syncErrorMessage(error: unknown): string {
  if (error instanceof CloudRoomError && error.status === 409) {
    return '別の端末で更新されました。最新の状態を読み込みました。'
  }
  if (error instanceof Error) return error.message
  return 'クラウド同期に失敗しました'
}

export function useRoomSync(roomCode: string | null, setDB: (next: DB) => void): RoomSyncResult {
  const [retryCount, setRetryCount] = useState(0)
  const [mode, setMode] = useState<SyncMode>(roomCode ? 'connecting' : 'idle')
  const [status, setStatus] = useState<SyncStatus>(roomCode ? 'connecting' : 'idle')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
  const revisionRef = useRef(0)
  const readyRef = useRef(false)
  const aliveRef = useRef(true)
  const pendingRef = useRef(0)
  const queueRef = useRef(Promise.resolve())
  const versionRef = useRef(0)
  const writeGenerationRef = useRef(0)
  const serverDBRef = useRef<DB>(emptyDB())

  useEffect(() => {
    const version = versionRef.current + 1
    versionRef.current = version
    writeGenerationRef.current += 1
    aliveRef.current = true
    readyRef.current = false
    revisionRef.current = 0
    pendingRef.current = 0
    queueRef.current = Promise.resolve()
    serverDBRef.current = emptyDB()
    setError(null)
    setNotice(null)
    setLastSyncedAt(null)
    setStatus(roomCode ? 'connecting' : 'idle')

    if (!roomCode) {
      setMode('idle')
      setStatus('idle')
      return () => {
        aliveRef.current = false
      }
    }

    const code = roomCode
    setMode('connecting')
    let timer: ReturnType<typeof setInterval> | undefined

    function isCurrent(): boolean {
      return aliveRef.current && versionRef.current === version
    }

    function adoptSnapshot(snapshot: RoomSnapshot, remoteUpdate: boolean): void {
      if (!isCurrent()) return
      const nextDB = snapshotDB(snapshot)
      revisionRef.current = snapshot.revision
      serverDBRef.current = nextDB
      setDB(nextDB)
      setError(null)
      if (remoteUpdate) setNotice('別端末の最新入力を反映しました')
      setStatus('synced')
      setLastSyncedAt(Date.now())
      setMode('cloud')
    }

    async function poll(): Promise<void> {
      if (!isCurrent() || pendingRef.current > 0) return
      try {
        const snapshot = await fetchRoom(code, revisionRef.current)
        if (!snapshot || !isCurrent() || snapshot.revision <= revisionRef.current) return
        adoptSnapshot(snapshot, readyRef.current)
      } catch (error) {
        if (isCurrent()) {
          setError(syncErrorMessage(error))
          setStatus('error')
        }
      }
    }

    void (async () => {
      try {
        const snapshot = await fetchRoom(code)
        if (!snapshot || !isCurrent()) return
        const nextDB = snapshotDB(snapshot)
        revisionRef.current = snapshot.revision
        serverDBRef.current = nextDB
        setDB(nextDB)
        readyRef.current = true
        setError(null)
        setNotice(null)
        setStatus('synced')
        setLastSyncedAt(Date.now())
        setMode('cloud')
        timer = setInterval(() => void poll(), 1000)
      } catch (error) {
        if (isCurrent()) {
          setError(syncErrorMessage(error))
          setStatus('error')
          setMode('connecting')
        }
      }
    })()

    return () => {
      aliveRef.current = false
      readyRef.current = false
      writeGenerationRef.current += 1
      if (timer) clearInterval(timer)
    }
  }, [roomCode, retryCount, setDB])

  const enqueue = useCallback((version: number, operation: () => Promise<void>) => {
    const generation = writeGenerationRef.current
    pendingRef.current += 1
    const next = queueRef.current
      .catch(() => {})
      .then(async () => {
        if (
          !aliveRef.current ||
          versionRef.current !== version ||
          writeGenerationRef.current !== generation
        ) {
          return
        }
        await operation()
      })
      .finally(() => {
        if (versionRef.current === version) pendingRef.current -= 1
      })
    queueRef.current = next
    return next
  }, [])

  const handleWriteError = useCallback(
    async (error: unknown, code: string, version: number, rollbackDB: DB) => {
      if (!aliveRef.current || versionRef.current !== version) return
      writeGenerationRef.current += 1

      if (error instanceof CloudRoomError && error.snapshot) {
        const nextDB = snapshotDB(error.snapshot)
        revisionRef.current = error.snapshot.revision
        serverDBRef.current = nextDB
        setDB(nextDB)
        setError(null)
        setNotice('別端末の最新入力を反映しました。今回の入力は保存されていません')
        setStatus('synced')
        setLastSyncedAt(Date.now())
        setMode('cloud')
        return
      }

      try {
        const snapshot = await fetchRoom(code)
        if (!snapshot || !aliveRef.current || versionRef.current !== version) return
        const nextDB = snapshotDB(snapshot)
        revisionRef.current = snapshot.revision
        serverDBRef.current = nextDB
        setDB(nextDB)
        setError(syncErrorMessage(error))
        setNotice('保存できなかった入力を破棄し、サーバーの状態へ戻しました')
        setStatus('error')
        setLastSyncedAt(Date.now())
        setMode('cloud')
      } catch {
        if (!aliveRef.current || versionRef.current !== version) return
        setDB(rollbackDB)
        setError(syncErrorMessage(error))
        setNotice('保存に失敗しました。最後に同期済みの状態へ戻しました')
        setStatus('error')
        setMode('cloud')
      }
    },
    [setDB],
  )

  const saveState = useCallback(
    (nextDB: DB, rollbackDB: DB) => {
      if (!roomCode) return
      setStatus('saving')
      setError(null)
      const code = roomCode
      const version = versionRef.current
      void enqueue(version, async () => {
        if (!readyRef.current) {
          setDB(rollbackDB)
          setError('ルームの接続が完了していません')
          setStatus('error')
          return
        }
        try {
          const nextRevision = await updateRoomState(code, {
            revision: revisionRef.current,
            state: toRoomState(nextDB),
          })
          if (!aliveRef.current || versionRef.current !== version) return
          revisionRef.current = nextRevision
          serverDBRef.current = nextDB
          setError(null)
          setNotice(null)
          setStatus('synced')
          setLastSyncedAt(Date.now())
          setMode('cloud')
        } catch (error) {
          await handleWriteError(error, code, version, rollbackDB)
        }
      })
    },
    [enqueue, handleWriteError, roomCode, setDB],
  )

  const saveGame = useCallback(
    (game: Game, nextDB: DB, rollbackDB: DB) => {
      if (!roomCode) return
      setStatus('saving')
      setError(null)
      const code = roomCode
      const version = versionRef.current
      void enqueue(version, async () => {
        if (!readyRef.current) {
          setDB(rollbackDB)
          setError('ルームの接続が完了していません')
          setStatus('error')
          return
        }
        try {
          const nextRevision = await addRoomGame(code, { revision: revisionRef.current, game })
          if (!aliveRef.current || versionRef.current !== version) return
          revisionRef.current = nextRevision
          serverDBRef.current = nextDB
          setError(null)
          setNotice(null)
          setStatus('synced')
          setLastSyncedAt(Date.now())
          setMode('cloud')
        } catch (error) {
          await handleWriteError(error, code, version, rollbackDB)
        }
      })
    },
    [enqueue, handleWriteError, roomCode, setDB],
  )

  const updateGame = useCallback(
    (game: Game, nextDB: DB, rollbackDB: DB) => {
      if (!roomCode) return
      setStatus('saving')
      setError(null)
      const code = roomCode
      const version = versionRef.current
      void enqueue(version, async () => {
        if (!readyRef.current) {
          setDB(rollbackDB)
          setError('ルームの接続が完了していません')
          setStatus('error')
          return
        }
        try {
          const nextRevision = await updateRoomGame(code, { revision: revisionRef.current, game })
          if (!aliveRef.current || versionRef.current !== version) return
          revisionRef.current = nextRevision
          serverDBRef.current = nextDB
          setError(null)
          setNotice(null)
          setStatus('synced')
          setLastSyncedAt(Date.now())
          setMode('cloud')
        } catch (error) {
          await handleWriteError(error, code, version, rollbackDB)
        }
      })
    },
    [enqueue, handleWriteError, roomCode, setDB],
  )

  const deleteGame = useCallback(
    (gameId: string, nextDB: DB, rollbackDB: DB) => {
      if (!roomCode) return
      setStatus('saving')
      setError(null)
      const code = roomCode
      const version = versionRef.current
      void enqueue(version, async () => {
        if (!readyRef.current) {
          setDB(rollbackDB)
          setError('ルームの接続が完了していません')
          setStatus('error')
          return
        }
        try {
          const nextRevision = await deleteRoomGame(code, gameId, revisionRef.current)
          if (!aliveRef.current || versionRef.current !== version) return
          revisionRef.current = nextRevision
          serverDBRef.current = nextDB
          setError(null)
          setNotice(null)
          setStatus('synced')
          setLastSyncedAt(Date.now())
          setMode('cloud')
        } catch (error) {
          await handleWriteError(error, code, version, rollbackDB)
        }
      })
    },
    [enqueue, handleWriteError, roomCode, setDB],
  )

  const retry = useCallback(() => setRetryCount((count) => count + 1), [])

  return {
    mode,
    status,
    error,
    notice,
    lastSyncedAt,
    retry,
    saveState,
    saveGame,
    updateGame,
    deleteGame,
  }
}
