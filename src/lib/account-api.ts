import { isAccountRoom, isAccountState, type AccountRoom, type AccountState } from './account'
import { CloudRoomError } from './cloud-room-api'

async function readResponse(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function request(path: string): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(path, { cache: 'no-store' })
  } catch {
    throw new CloudRoomError('アカウント情報を取得できません', 0)
  }
  const payload = await readResponse(response)
  if (!response.ok) {
    const message =
      typeof payload === 'object' &&
      payload !== null &&
      !Array.isArray(payload) &&
      typeof (payload as Record<string, unknown>).error === 'string'
        ? String((payload as Record<string, unknown>).error)
        : `アカウントAPIエラー (${response.status})`
    throw new CloudRoomError(message, response.status)
  }
  return payload
}

export async function fetchAccount(): Promise<AccountState> {
  const payload = await request('/api/me')
  if (!isAccountState(payload)) throw new CloudRoomError('アカウント情報の応答が不正です', 502)
  return payload
}

export async function fetchMyRooms(): Promise<AccountRoom[]> {
  const payload = await request('/api/my/rooms')
  const rooms =
    typeof payload === 'object' && payload !== null && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).rooms
      : null
  if (!Array.isArray(rooms) || !rooms.every(isAccountRoom)) {
    throw new CloudRoomError('アカウントのルーム一覧の応答が不正です', 502)
  }
  return rooms
}
