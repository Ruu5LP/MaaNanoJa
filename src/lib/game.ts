// 半荘の進行（親の連荘・本場・供託リーチ棒の自動管理）と、局ログからの持ち点再生。
import { handDeltas, computeResults, type GameResult } from './scoring'
import type { Game, Hand, HandFormState, Rules } from './domain'

export const WINDS = ['東', '南', '西', '北'] as const

/** 座席順を、指定した人が先頭（起家）に来るよう回転する。他3人の相対的な並びは保持する。 */
export function rotateToDealer(seats: string[], dealerId: string): string[] {
  const idx = seats.indexOf(dealerId)
  if (idx <= 0) return seats
  return [...seats.slice(idx), ...seats.slice(0, idx)]
}

/**
 * 局ログの1局を編集フォームの初期値に変換する（局ログから選んで編集し直すため）。
 * 点数修正（adjust）は入力フォームの対象外なので null を返す。
 */
export function handToFormState(hand: Hand): HandFormState | null {
  if (hand.type === 'ron') {
    return {
      type: 'ron',
      winners: hand.wins.map((w) => w.winner),
      loser: hand.loser,
      scores: Object.fromEntries(hand.wins.map((w) => [w.winner, { han: w.han, fu: w.fu }])),
      riichi: hand.riichi,
      tenpai: [],
    }
  }
  if (hand.type === 'tsumo') {
    return {
      type: 'tsumo',
      winners: [hand.winner],
      loser: '',
      scores: { [hand.winner]: { han: hand.han, fu: hand.fu } },
      riichi: hand.riichi,
      tenpai: [],
    }
  }
  if (hand.type === 'draw') {
    return {
      type: 'draw',
      winners: [],
      loser: '',
      scores: {},
      riichi: hand.riichi,
      tenpai: hand.tenpai,
    }
  }
  if (hand.type === 'abortive') {
    return { type: 'abortive', winners: [], loser: '', scores: {}, riichi: hand.riichi, tenpai: [] }
  }
  return null
}

/** 半荘の途中状態（局ログを再生して得られる） */
export interface GameState {
  /** playerId -> 現在の持ち点 */
  points: Record<string, number>
  /** 場に残っている供託リーチ棒（点数） */
  pot: number
  /** 親のseat index */
  dealerIndex: number
  /** 場風 0=東, 1=南, ... */
  roundWind: number
  /** 局番号（1..） */
  roundNum: number
  /** 本場 */
  honba: number
}

/** 1局分の再生結果 */
export interface HandStep {
  hand: Hand
  label: string
  dealerIndex: number
  honba: number
  delta: Record<string, number>
  points: Record<string, number>
}

export interface ReplayResult {
  state: GameState
  steps: HandStep[]
}

function rulesForGame(game: Game, fallback: Rules): Rules {
  return game.rules ?? fallback
}

export function initialState(rules: Rules, playerIds: string[]): GameState {
  const points: Record<string, number> = {}
  for (const pid of playerIds) points[pid] = rules.startPoints
  return { points, pot: 0, dealerIndex: 0, roundWind: 0, roundNum: 1, honba: 0 }
}

export function roundLabel(state: GameState): string {
  const base = `${WINDS[state.roundWind] ?? '?'}${state.roundNum}局`
  return state.honba ? `${base} ${state.honba}本場` : base
}

/** 局が終わった後の次状態（親の連荘・本場・局送り）を返す */
function advance(state: GameState, hand: Hand, seats: string[]): GameState {
  // 点数修正は進行（親・本場・場風）に影響しない。
  if (hand.type === 'adjust') return state

  const dealerId = seats[state.dealerIndex]
  let renchan: boolean
  if (hand.type === 'ron') renchan = hand.wins.some((w) => w.winner === dealerId)
  else if (hand.type === 'tsumo') renchan = hand.winner === dealerId
  else if (hand.type === 'draw') renchan = hand.tenpai.includes(dealerId ?? '')
  else renchan = true // 途中流局は連荘

  const next: GameState = { ...state, points: { ...state.points } }
  if (renchan) {
    next.honba = state.honba + 1
    return next
  }
  next.honba = 0
  next.dealerIndex = (state.dealerIndex + 1) % seats.length
  if (next.dealerIndex === 0) {
    next.roundWind = state.roundWind + 1
    next.roundNum = 1
  } else {
    next.roundNum = state.roundNum + 1
  }
  return next
}

/** 局ログを最初から再生し、各局の点数移動と最終状態を返す */
export function replay(game: Game, rules: Rules): ReplayResult {
  const effectiveRules = rulesForGame(game, rules)
  let st = initialState(effectiveRules, game.playerIds)
  const seats = game.playerIds
  const steps: HandStep[] = []
  for (const h of game.hands) {
    if (h.honbaOverride !== undefined) st.honba = h.honbaOverride
    const { delta, potAfter } = handDeltas(seats, st.dealerIndex, h, st.honba, st.pot)
    for (const pid of seats) st.points[pid] = (st.points[pid] ?? 0) + (delta[pid] ?? 0)
    st.pot = potAfter
    steps.push({
      hand: h,
      label: roundLabel(st),
      dealerIndex: st.dealerIndex,
      honba: st.honba,
      delta,
      points: { ...st.points },
    })
    st = advance(st, h, seats)
  }
  return { state: st, steps }
}

/** 半荘の最終持ち点（局ログがあれば再生結果、なければ手入力値） */
export function finalPoints(game: Game, rules: Rules): Record<string, number> {
  if (game.hands.length) return replay(game, rules).state.points
  return game.finalPoints
}

/** 半荘の順位・スコア（ウマ・オカ込み） */
export function gameResults(game: Game, rules: Rules): GameResult[] {
  const effectiveRules = rulesForGame(game, rules)
  const pts = finalPoints(game, effectiveRules)
  const entries = game.playerIds.map((pid, idx) => ({
    playerId: pid,
    points: pts[pid] ?? 0,
    seatIndex: idx,
  }))
  return computeResults(entries, effectiveRules)
}

export interface PointsCheck {
  sum: number
  expected: number
  diff: number
  ok: boolean
}

/** 入力の合計チェック（配給原点×人数と一致するか）。供託残りは許容。 */
export function pointsCheck(game: Game, rules: Rules): PointsCheck {
  const effectiveRules = rulesForGame(game, rules)
  const pts = finalPoints(game, effectiveRules)
  const sum = game.playerIds.reduce((a, pid) => a + (pts[pid] ?? 0), 0)
  const expected = effectiveRules.startPoints * game.playerIds.length
  return { sum, expected, diff: sum - expected, ok: sum === expected }
}
