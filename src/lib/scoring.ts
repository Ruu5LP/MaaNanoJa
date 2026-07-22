// 麻雀のスコア計算まわり（純粋関数・副作用なし）。
// - 半荘の最終持ち点 → 順位・ウマ・オカ・スコア（既存スプレッドシートと同じ計算）
// - 局ごとの和了/流局 → 各家の点数移動（自動集計用）
//
// スコアの単位は「点数 ÷ 1000」（例: +30.0）。既存ツールと合わせてある。
import type { Hand, Rules } from './domain'

/** 100点単位で切り上げ */
export function ceil100(x: number): number {
  return Math.ceil(x / 100) * 100
}

/**
 * 翻・符から基本点(base)を求める。満貫以上は翻数で固定。
 */
export function basePoints(han: number, fu: number): number {
  if (han >= 13) return 8000 // 役満
  if (han >= 11) return 6000 // 三倍満
  if (han >= 8) return 4000 // 倍満
  if (han >= 6) return 3000 // 跳満
  if (han >= 5) return 2000 // 満貫
  const base = fu * Math.pow(2, 2 + han)
  return Math.min(base, 2000) // 4翻30符・3翻60符などは満貫に丸める
}

export interface HandValue {
  /** 子のロン和了点（放銃者が払う総額） */
  ronNonDealer: number
  /** 親のロン和了点 */
  ronDealer: number
  /** 子ツモ時、子1人が払う額 */
  tsumoNonDealer: number
  /** 子ツモ時、親が払う額 */
  tsumoDealer: number
  /** 親ツモ時、子1人が払う額 */
  tsumoEachDealer: number
}

/** 和了点の内訳を返す。 */
export function handValue(han: number, fu: number): HandValue {
  const base = basePoints(han, fu)
  return {
    ronNonDealer: ceil100(base * 4),
    ronDealer: ceil100(base * 6),
    tsumoNonDealer: ceil100(base),
    tsumoDealer: ceil100(base * 2),
    tsumoEachDealer: ceil100(base * 2),
  }
}

/** 和了点（合計）の表示用。 */
export function agariTotal(
  han: number,
  fu: number,
  winnerIsDealer: boolean,
  isTsumo: boolean,
): number {
  const v = handValue(han, fu)
  if (!isTsumo) return winnerIsDealer ? v.ronDealer : v.ronNonDealer
  if (winnerIsDealer) return v.tsumoEachDealer * 3
  return v.tsumoNonDealer * 2 + v.tsumoDealer
}

export interface HandDeltas {
  /** playerId -> この局の点数増減 */
  delta: Record<string, number>
  /** この局終了後に場に残る供託リーチ棒（点数） */
  potAfter: number
}

/**
 * 1局分の点数移動を計算する。
 * @param seats プレイヤーIDの配列（起家=index0, 東南西北の並び）
 * @param dealerIndex 親のseat index
 * @param hand 局の記録
 * @param honba 本場（この局時点の本場数）
 * @param potBefore この局開始時点で場に残っている供託リーチ棒の合計（点数）
 */
export function handDeltas(
  seats: string[],
  dealerIndex: number,
  hand: Hand,
  honba: number,
  potBefore = 0,
): HandDeltas {
  const delta: Record<string, number> = {}
  for (const pid of seats) delta[pid] = 0

  // 立直棒: 各1000点を場に出す
  let pot = potBefore
  for (const pid of hand.riichi) {
    delta[pid] = (delta[pid] ?? 0) - 1000
    pot += 1000
  }

  const dealerId = seats[dealerIndex]

  if (hand.type === 'ron') {
    // ダブロン・トリプルロン: 本場ボーナスは和了者それぞれに、供託は最初の和了者が総取り。
    const honbaPay = honba * 300
    let totalFromLoser = 0
    hand.wins.forEach((win, i) => {
      const winnerIsDealer = win.winner === dealerId
      const v = handValue(win.han, win.fu)
      const gain = winnerIsDealer ? v.ronDealer : v.ronNonDealer
      const potShare = i === 0 ? pot : 0
      delta[win.winner] = (delta[win.winner] ?? 0) + gain + honbaPay + potShare
      totalFromLoser += gain + honbaPay
    })
    delta[hand.loser] = (delta[hand.loser] ?? 0) - totalFromLoser
    pot = 0
  } else if (hand.type === 'tsumo') {
    const winnerIsDealer = hand.winner === dealerId
    const v = handValue(hand.han, hand.fu)
    const honbaEach = honba * 100
    let total = 0
    for (const pid of seats) {
      if (pid === hand.winner) continue
      let pay: number
      if (winnerIsDealer) pay = v.tsumoEachDealer
      else pay = pid === dealerId ? v.tsumoDealer : v.tsumoNonDealer
      pay += honbaEach
      delta[pid] = (delta[pid] ?? 0) - pay
      total += pay
    }
    delta[hand.winner] = (delta[hand.winner] ?? 0) + total + pot
    pot = 0
  } else if (hand.type === 'draw') {
    // 流局: テンパイ者とノーテン者で3000点をやり取り。供託は場に残す。
    const n = hand.tenpai.length
    if (n > 0 && n < 4) {
      const receive = 3000 / n
      const pay = 3000 / (4 - n)
      for (const pid of seats) {
        if (hand.tenpai.includes(pid)) delta[pid] = (delta[pid] ?? 0) + receive
        else delta[pid] = (delta[pid] ?? 0) - pay
      }
    }
    // abortive(途中流局)は点数移動なし・供託据え置き
  }

  return { delta, potAfter: pot }
}

export interface ResultEntry {
  playerId: string
  /** 最終持ち点 */
  points: number
  /** 席順（起家順, 0..）。同点時の上家優先に使う。 */
  seatIndex: number
}

export interface GameResult extends ResultEntry {
  /** 1位=1 */
  rank: number
  /** 素点スコア（(持ち点-返し点)/1000） */
  raw: number
  /** ウマ・オカ込みスコア（単位: ÷1000） */
  score: number
}

/**
 * 半荘の最終持ち点から順位・スコアを計算する（既存スプレッドシートと同じ）。
 * オカは (returnPoints - startPoints) * 人数 / 1000 をトップに加算。
 */
export function computeResults(entries: ResultEntry[], rules: Rules): GameResult[] {
  const n = entries.length
  const start = rules.startPoints
  const ret = rules.returnPoints
  const uma = rules.uma
  const oka = ((ret - start) * n) / 1000

  // 順位付け: 点数が高い順、同点は上家優先(seatIndexが小さい方が上位)
  const sorted = [...entries].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    return a.seatIndex - b.seatIndex
  })

  return sorted.map((e, i) => {
    const rank = i + 1
    const raw = (e.points - ret) / 1000
    let score = raw + (uma[i] ?? 0)
    if (rank === 1) score += oka
    return {
      ...e,
      rank,
      raw: round2(raw),
      score: round2(score),
    }
  })
}

/** 点数早見表の行（翻）・列（符）。1〜4翻は符ごとに点数が変わる。 */
export const SCORE_TABLE_HANS = [1, 2, 3, 4] as const
export const SCORE_TABLE_FUS = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110] as const
/** 満貫以上は符に依存しないので専用の行として扱う。 */
export const MANGAN_HANS = [5, 6, 8, 11, 13] as const

export function hanLabel(han: number): string | null {
  if (han >= 13) return '役満'
  if (han >= 11) return '三倍満'
  if (han >= 8) return '倍満'
  if (han >= 6) return '跳満'
  if (han >= 5) return '満貫'
  return null
}

export interface ScoreCell {
  han: number
  fu: number
  total: number
}

/**
 * 1〜4翻 × 符 の点数早見表を返す（行=翻、列=符）。
 * 翻・符を直接選ばせる代わりに、点数早見表からそのまま選べるようにするため。
 */
export function scoreTable(winnerIsDealer: boolean, isTsumo: boolean): ScoreCell[][] {
  return SCORE_TABLE_HANS.map((han) =>
    SCORE_TABLE_FUS.map((fu) => ({ han, fu, total: agariTotal(han, fu, winnerIsDealer, isTsumo) })),
  )
}

/** 満貫〜役満の行（符は計算に影響しないため30固定）。 */
export function manganRow(winnerIsDealer: boolean, isTsumo: boolean): ScoreCell[] {
  return MANGAN_HANS.map((han) => ({
    han,
    fu: 30,
    total: agariTotal(han, 30, winnerIsDealer, isTsumo),
  }))
}

export function round2(x: number): number {
  const r = Math.round(x * 100) / 100
  return r === 0 ? 0 : r // -0 を 0 に正規化
}
