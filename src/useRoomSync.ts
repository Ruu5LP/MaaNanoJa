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
import { normalizeDB, SCHEMA_VERSION } from './lib/store'

export type SyncMode = 'idle' | 'connecting' | 'cloud'

export const SYNC_LABEL: Record<SyncMode, string> = {
  idle: '☁️ ルーム未選択',
  connecting: '☁️ 接続中…',
  cloud: '☁️ クラウド同期中',
}

interface RoomSyncResult {
  mode: SyncMode
  error: string | null
  saveState(nextDB: DB): void
  saveGame(game: Game): void
  updateGame(game: Game): void
  deleteGame(gameId: string): void
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
  const [mode, setMode] = useState<SyncMode>(roomCode ? 'connecting' : 'idle')
  const [error, setError] = useState<string | null>(null)
  const revisionRef = useRef(0)
  const readyRef = useRef(false)
  const aliveRef = useRef(true)
  const pendingRef = useRef(0)
  const queueRef = useRef(Promise.resolve())
  const versionRef = useRef(0)

  useEffect(() => {
    const version = versionRef.current + 1
    versionRef.current = version
    aliveRef.current = true
    readyRef.current = false
    revisionRef.current = 0
    pendingRef.current = 0
    queueRef.current = Promise.resolve()
    setError(null)

    if (!roomCode) {
      setMode('idle')
      return () => {
        aliveRef.current = false
      }
    }

    const code = roomCode
    setMode('connecting')
    let timer: ReturnType<typeof setInterval> | undefined

    async function poll() {
      if (!aliveRef.current || versionRef.current !== version || pendingRef.current > 0) return
      try {
        const snapshot = await fetchRoom(code)
        if (!aliveRef.current || versionRef.current !== version) return
        if (snapshot.revision <= revisionRef.current) return
        revisionRef.current = snapshot.revision
        setDB(snapshotDB(snapshot))
        setError(null)
        setMode('cloud')
      } catch (e) {
        if (aliveRef.current && versionRef.current === version) setError(syncErrorMessage(e))
      }
    }

    void (async () => {
      try {
        const snapshot = await fetchRoom(code)
        if (!aliveRef.current || versionRef.current !== version) return
        revisionRef.current = snapshot.revision
        setDB(snapshotDB(snapshot))
        readyRef.current = true
        setError(null)
        setMode('cloud')
        timer = setInterval(() => void poll(), 1000)
      } catch (e) {
        if (aliveRef.current && versionRef.current === version) {
          setError(syncErrorMessage(e))
          setMode('connecting')
        }
      }
    })()

    return () => {
      aliveRef.current = false
      readyRef.current = false
      if (timer) clearInterval(timer)
    }
  }, [roomCode, setDB])

  const enqueue = useCallback((operation: () => Promise<void>) => {
    pendingRef.current += 1
    const next = queueRef.current
      .catch(() => {})
      .then(operation)
      .finally(() => {
        pendingRef.current -= 1
      })
    queueRef.current = next
    return next
  }, [])

  const handleWriteError = useCallback(
    (error: unknown) => {
      if (error instanceof CloudRoomError && error.snapshot && aliveRef.current) {
        revisionRef.current = error.snapshot.revision
        setDB(snapshotDB(error.snapshot))
      }
      if (aliveRef.current) setError(syncErrorMessage(error))
    },
    [setDB],
  )

  const saveState = useCallback(
    (nextDB: DB) => {
      if (!roomCode) return
      const code = roomCode
      const version = versionRef.current
      void enqueue(async () => {
        if (!readyRef.current || !aliveRef.current || versionRef.current !== version) return
        try {
          const nextRevision = await updateRoomState(code, {
            revision: revisionRef.current,
            state: toRoomState(nextDB),
          })
          revisionRef.current = nextRevision
          setError(null)
          setMode('cloud')
        } catch (e) {
          handleWriteError(e)
        }
      })
    },
    [enqueue, handleWriteError, roomCode],
  )

  const saveGame = useCallback(
    (game: Game) => {
      if (!roomCode) return
      const code = roomCode
      const version = versionRef.current
      void enqueue(async () => {
        if (!readyRef.current || !aliveRef.current || versionRef.current !== version) return
        try {
          const nextRevision = await addRoomGame(code, { revision: revisionRef.current, game })
          revisionRef.current = nextRevision
          setError(null)
          setMode('cloud')
        } catch (e) {
          handleWriteError(e)
        }
      })
    },
    [enqueue, handleWriteError, roomCode],
  )

  const updateGame = useCallback(
    (game: Game) => {
      if (!roomCode) return
      const code = roomCode
      const version = versionRef.current
      void enqueue(async () => {
        if (!readyRef.current || !aliveRef.current || versionRef.current !== version) return
        try {
          const nextRevision = await updateRoomGame(code, { revision: revisionRef.current, game })
          revisionRef.current = nextRevision
          setError(null)
          setMode('cloud')
        } catch (e) {
          handleWriteError(e)
        }
      })
    },
    [enqueue, handleWriteError, roomCode],
  )

  const deleteGame = useCallback(
    (gameId: string) => {
      if (!roomCode) return
      const code = roomCode
      const version = versionRef.current
      void enqueue(async () => {
        if (!readyRef.current || !aliveRef.current || versionRef.current !== version) return
        try {
          const nextRevision = await deleteRoomGame(code, gameId, revisionRef.current)
          revisionRef.current = nextRevision
          setError(null)
          setMode('cloud')
        } catch (e) {
          handleWriteError(e)
        }
      })
    },
    [enqueue, handleWriteError, roomCode],
  )

  return { mode, error, saveState, saveGame, updateGame, deleteGame }
}
