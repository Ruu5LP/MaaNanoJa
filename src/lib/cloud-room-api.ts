import {
  toRoomCreationPayload,
  type RoomCreationOptions,
  type RoomGamePayload,
  type RoomSnapshot,
  type RoomStatePayload,
} from './cloud-room'
import type { DB } from './domain'
import { parseRoomSnapshot } from './room-validation'

interface UnchangedRoomResponse {
  roomCode: string
  revision: number
  unchanged: true
}

export class CloudRoomError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly snapshot?: RoomSnapshot,
  ) {
    super(message)
  }
}

async function readResponse(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRoomSnapshot(value: unknown): value is RoomSnapshot {
  try {
    parseRoomSnapshot(value)
    return true
  } catch {
    return false
  }
}

function isUnchangedRoomResponse(value: unknown): value is UnchangedRoomResponse {
  return (
    isRecord(value) &&
    typeof value.roomCode === 'string' &&
    typeof value.revision === 'number' &&
    Number.isSafeInteger(value.revision) &&
    value.revision >= 0 &&
    value.unchanged === true
  )
}

function errorMessage(payload: unknown, fallback: string): string {
  return isRecord(payload) && typeof payload.error === 'string' ? payload.error : fallback
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(path, { ...init, cache: 'no-store', credentials: 'same-origin' })
  } catch {
    throw new CloudRoomError('クラウドに接続できません', 0)
  }
  const payload = await readResponse(response)
  if (!response.ok) {
    let snapshot: RoomSnapshot | undefined
    if (isRecord(payload) && isRoomSnapshot(payload.snapshot)) {
      try {
        snapshot = parseRoomSnapshot(payload.snapshot)
      } catch {
        snapshot = undefined
      }
    }
    throw new CloudRoomError(
      errorMessage(payload, `クラウドAPIエラー (${response.status})`),
      response.status,
      snapshot,
    )
  }
  return payload
}

export async function createRoom(
  db: DB,
  options: RoomCreationOptions = { migrateGames: false },
): Promise<{ roomCode: string; revision: number; migratedGames: number }> {
  const payload = await request('/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toRoomCreationPayload(db, options)),
  })
  if (
    !isRecord(payload) ||
    typeof payload.roomCode !== 'string' ||
    typeof payload.revision !== 'number' ||
    typeof payload.migratedGames !== 'number' ||
    !Number.isInteger(payload.migratedGames) ||
    payload.migratedGames < 0
  ) {
    throw new CloudRoomError('ルーム作成の応答が不正です', 502)
  }
  return {
    roomCode: payload.roomCode,
    revision: payload.revision,
    migratedGames: payload.migratedGames,
  }
}

export async function fetchRoom(
  roomCode: string,
  sinceRevision?: number,
): Promise<RoomSnapshot | null> {
  const query =
    sinceRevision === undefined ? '' : `?since=${encodeURIComponent(String(sinceRevision))}`
  const payload = await request(`/api/rooms/${encodeURIComponent(roomCode)}${query}`)
  if (isUnchangedRoomResponse(payload)) return null
  try {
    return parseRoomSnapshot(payload)
  } catch {
    throw new CloudRoomError('ルーム取得の応答が不正です', 502)
  }
}

export async function joinRoom(roomCode: string): Promise<void> {
  const payload = await request(`/api/rooms/${encodeURIComponent(roomCode)}/join`, {
    method: 'POST',
  })
  if (!isRecord(payload) || payload.roomCode !== roomCode) {
    throw new CloudRoomError('ルーム参加の応答が不正です', 502)
  }
}

export async function deleteRoom(roomCode: string): Promise<void> {
  const payload = await request(`/api/rooms/${encodeURIComponent(roomCode)}`, {
    method: 'DELETE',
  })
  if (!isRecord(payload) || payload.roomCode !== roomCode) {
    throw new CloudRoomError('ルーム削除の応答が不正です', 502)
  }
}

export async function leaveRoom(roomCode: string): Promise<void> {
  const payload = await request(`/api/rooms/${encodeURIComponent(roomCode)}/membership`, {
    method: 'DELETE',
  })
  if (!isRecord(payload) || payload.roomCode !== roomCode) {
    throw new CloudRoomError('ルーム退出の応答が不正です', 502)
  }
}

export async function updateRoomState(
  roomCode: string,
  payload: RoomStatePayload,
): Promise<number> {
  const response = await request(`/api/rooms/${encodeURIComponent(roomCode)}/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!isRecord(response) || typeof response.revision !== 'number') {
    throw new CloudRoomError('ルーム更新の応答が不正です', 502)
  }
  return response.revision
}

export async function addRoomGame(roomCode: string, payload: RoomGamePayload): Promise<number> {
  const response = await request(`/api/rooms/${encodeURIComponent(roomCode)}/games`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!isRecord(response) || typeof response.revision !== 'number') {
    throw new CloudRoomError('ゲーム保存の応答が不正です', 502)
  }
  return response.revision
}

export async function deleteRoomGame(
  roomCode: string,
  gameId: string,
  revision: number,
): Promise<number> {
  const response = await request(
    `/api/rooms/${encodeURIComponent(roomCode)}/games/${encodeURIComponent(gameId)}`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision }),
    },
  )
  if (!isRecord(response) || typeof response.revision !== 'number') {
    throw new CloudRoomError('ゲーム削除の応答が不正です', 502)
  }
  return response.revision
}

export async function updateRoomGame(roomCode: string, payload: RoomGamePayload): Promise<number> {
  const response = await request(
    `/api/rooms/${encodeURIComponent(roomCode)}/games/${encodeURIComponent(payload.game.id)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
  if (!isRecord(response) || typeof response.revision !== 'number') {
    throw new CloudRoomError('ゲーム更新の応答が不正です', 502)
  }
  return response.revision
}
