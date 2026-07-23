// localStorage への保存・読み込みと、初期データ。
import type { DB, Draft, Rules } from './domain'

export const STORAGE_KEY = 'mahjong-tracker/v1'
// v2: 進行中の半荘 draft を DB に持たせた（全端末共有）。旧データ(v1)は draft:null として読む。
export const SCHEMA_VERSION = 2

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export const DEFAULT_RULES: Rules = {
  startPoints: 25000, // 配給原点（持ち点）
  returnPoints: 30000, // 返し点（原点）
  uma: [30, 10, -10, -30], // 順位ウマ（10-30）
  tiebreak: 'shimocha', // 同点の扱い: 上家優先
}

/** プレイヤー・対局データが空の初期状態。最初はここから始める（デモ／過去データは入れない）。 */
export function emptyDB(): DB {
  return {
    version: SCHEMA_VERSION,
    players: [],
    rules: { ...DEFAULT_RULES },
    games: [],
    draft: null,
  }
}

export function loadDB(): DB {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyDB()
    return normalizeDB(JSON.parse(raw))
  } catch (e) {
    console.warn('データの読み込みに失敗。空の状態から始めます。', e)
    return emptyDB()
  }
}

export function saveDB(db: DB): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
}

/** 外部（保存済みJSON・import）から来た未知の形を、安全にDB型へ整える。 */
export function normalizeDB(db: unknown): DB {
  const src = (db ?? {}) as Partial<DB>
  return {
    version: SCHEMA_VERSION,
    players: Array.isArray(src.players) ? src.players : [],
    rules: { ...DEFAULT_RULES, ...(src.rules ?? {}) },
    games: Array.isArray(src.games) ? src.games : [],
    draft: isDraft(src.draft) ? src.draft : null,
  }
}

/** draft が「席順を持つ進行中の半荘」の形をしているかの緩い検証（壊れた値は null に倒す）。 */
function isDraft(v: unknown): v is Draft {
  return (
    typeof v === 'object' &&
    v !== null &&
    Array.isArray((v as Draft).playerIds) &&
    Array.isArray((v as Draft).hands)
  )
}

export function exportJSON(db: DB): string {
  return JSON.stringify(db, null, 2)
}
