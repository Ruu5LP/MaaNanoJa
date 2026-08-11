import type { DB } from './domain'
import { exportJSON } from './store'
import { parseDB } from './room-validation'

/** 未ログインのお試しデータ。localStorageの旧データ移行とは別の一時保存領域。 */
export const GUEST_SESSION_KEY = 'maananaja/guest-session/v1'

function guestStorage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

export function readGuestSessionDB(): DB | null {
  const storage = guestStorage()
  if (!storage) return null

  let raw: string | null
  try {
    raw = storage.getItem(GUEST_SESSION_KEY)
  } catch {
    return null
  }
  if (!raw) return null

  try {
    return parseDB(JSON.parse(raw))
  } catch {
    try {
      storage.removeItem(GUEST_SESSION_KEY)
    } catch {
      // 壊れた値を読み取れなくても、セッション自体は継続する。
    }
    return null
  }
}

export function writeGuestSessionDB(db: DB): void {
  const storage = guestStorage()
  if (!storage) return

  try {
    storage.setItem(GUEST_SESSION_KEY, exportJSON(db))
  } catch {
    // sessionStorageが利用できない環境でも、お試し操作自体は継続できるようにする。
  }
}

export function clearGuestSessionDB(): void {
  const storage = guestStorage()
  if (!storage) return

  try {
    storage.removeItem(GUEST_SESSION_KEY)
  } catch {
    // sessionStorageが利用できない環境では、消去処理も何もしない。
  }
}
