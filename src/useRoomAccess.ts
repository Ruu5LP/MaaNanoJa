import { useCallback, useEffect, useState } from 'react'
import type { AccountState } from './lib/account'
import { CloudRoomError, fetchRoomPreview, joinRoom } from './lib/cloud-room-api'
import type { RoomAccessStatus } from './views/RoomAccessView'

export interface RoomAccessState {
  status: RoomAccessStatus | 'ready'
  ownerDisplayName?: string
  error?: string
}

export function useRoomAccess(
  roomCode: string | null,
  account: AccountState | null,
  accountError: string | null,
) {
  const [access, setAccess] = useState<RoomAccessState>({
    status: roomCode ? 'checking' : 'ready',
  })
  const [readyRoomCode, setReadyRoomCode] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    if (!roomCode) {
      setReadyRoomCode(null)
      setAccess({ status: 'ready' })
      return
    }
    setReadyRoomCode(null)
    if (accountError) {
      setAccess({ status: 'error', error: accountError })
      return
    }
    if (!account) {
      setAccess({ status: 'checking' })
      return
    }
    if (account.loginEnabled && !account.user) {
      setAccess({ status: 'login-required' })
      return
    }
    if (!account.loginEnabled) {
      setReadyRoomCode(roomCode)
      setAccess({ status: 'ready' })
      return
    }

    setAccess({ status: 'checking' })
    void fetchRoomPreview(roomCode)
      .then((preview) => {
        if (cancelled) return
        setAccess(
          preview.isMember
            ? { status: 'ready' }
            : { status: 'confirm', ownerDisplayName: preview.ownerDisplayName },
        )
        setReadyRoomCode(preview.isMember ? roomCode : null)
      })
      .catch((error) => {
        if (cancelled) return
        setAccess({
          status: 'error',
          error: error instanceof CloudRoomError ? error.message : 'ルームを確認できませんでした',
        })
      })

    return () => {
      cancelled = true
    }
  }, [account, accountError, retryCount, roomCode])

  const joinPendingRoom = useCallback(async () => {
    if (!roomCode || access.status !== 'confirm') return
    const ownerDisplayName = access.ownerDisplayName
    setAccess({ status: 'joining', ownerDisplayName })
    try {
      await joinRoom(roomCode)
      setReadyRoomCode(roomCode)
      setAccess({ status: 'ready' })
    } catch (error) {
      setReadyRoomCode(null)
      setAccess({
        status: 'error',
        error: error instanceof CloudRoomError ? error.message : 'ルームに参加できませんでした',
      })
    }
  }, [access, roomCode])

  const retry = useCallback(() => setRetryCount((count) => count + 1), [])

  return {
    access,
    isReady: roomCode !== null && readyRoomCode === roomCode,
    joinPendingRoom,
    retry,
  }
}
