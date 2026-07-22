// localStorage への保存・読み込みと、初期データ。
import type { DB, Game, Player, Rules } from './domain'

export const STORAGE_KEY = 'mahjong-tracker/v1'
export const SCHEMA_VERSION = 1

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export const DEFAULT_RULES: Rules = {
  startPoints: 25000, // 配給原点（持ち点）
  returnPoints: 30000, // 返し点（原点）
  uma: [30, 10, -10, -30], // 順位ウマ（10-30）
  tiebreak: 'shimocha', // 同点の扱い: 上家優先
}

// 既存スプレッドシートの登録メンバー
const SEED_PLAYERS: Player[] = [
  { id: 'p-reini', name: 'れいに' },
  { id: 'p-mosso', name: 'もっそ' },
  { id: 'p-saaryan', name: 'さーりゃん' },
  { id: 'p-choukami', name: '超髪' },
]

// 既存スプレッドシート「点数入力」の過去9試合（最終持ち点, 並びはSEED_PLAYERS順）
const SEED_GAME_POINTS: number[][] = [
  [20900, 57600, 14300, 7200],
  [32700, -4500, 36000, 35800],
  [21100, 9500, 69500, -100],
  [22100, 32800, -1400, 46500],
  [20900, -300, 26100, 53300],
  [23500, 50800, -800, 26500],
  [15000, 19500, 31400, 34100],
  [14900, 24200, 33900, 27000],
  [21800, 29000, 18700, 30500],
]

function seedGames(): Game[] {
  const pids = SEED_PLAYERS.map((p) => p.id)
  return SEED_GAME_POINTS.map((points, i) => ({
    id: `seed-${i + 1}`,
    date: '',
    note: '過去データ（スプレッドシートより）',
    playerIds: pids,
    hands: [],
    finalPoints: Object.fromEntries(pids.map((pid, idx) => [pid, points[idx] ?? 0])),
    createdAt: i,
  }))
}

export function defaultDB(): DB {
  return {
    version: SCHEMA_VERSION,
    players: SEED_PLAYERS.map((p) => ({ ...p })),
    rules: { ...DEFAULT_RULES },
    games: seedGames(),
  }
}

export function loadDB(): DB {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultDB()
    return normalizeDB(JSON.parse(raw))
  } catch (e) {
    console.warn('データの読み込みに失敗。初期データを使います。', e)
    return defaultDB()
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
  }
}

export function exportJSON(db: DB): string {
  return JSON.stringify(db, null, 2)
}
