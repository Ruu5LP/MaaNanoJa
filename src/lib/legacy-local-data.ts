import { normalizeDB, STORAGE_KEY } from './store'
import type { DB } from './domain'

/** Cloudflare-first移行期間だけ使う、旧localStorage履歴の読み取り境界。 */
export function readLegacyLocalDB(): DB | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const db = normalizeDB(JSON.parse(raw))
    return db.games.length > 0 ? db : null
  } catch {
    return null
  }
}

/** 明示的な移行成功後にだけ、旧localStorageデータを片付ける。 */
export function clearLegacyLocalDB(): void {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY)
}
