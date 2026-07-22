// 半荘の進行（親・本場・供託リーチ棒の自動管理）と、局ログからの持ち点再生。
import { handDeltas, computeResults } from './scoring.js'

export const WINDS = ['東', '南', '西', '北']

export function initialState(rules, playerIds) {
  const points = {}
  for (const pid of playerIds) points[pid] = rules.startPoints
  return { points, pot: 0, dealerIndex: 0, roundWind: 0, roundNum: 1, honba: 0 }
}

export function roundLabel(state) {
  const base = `${WINDS[state.roundWind] ?? '?'}${state.roundNum}局`
  return state.honba ? `${base} ${state.honba}本場` : base
}

// 局が終わった後の次状態（親の連荘・本場・局送り）を返す
function advance(state, hand, seats) {
  const dealerId = seats[state.dealerIndex]
  let renchan
  if (hand.type === 'ron' || hand.type === 'tsumo') renchan = hand.winner === dealerId
  else if (hand.type === 'draw') renchan = (hand.tenpai || []).includes(dealerId)
  else renchan = true // 途中流局は連荘

  const next = { ...state, points: { ...state.points } }
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

// 局ログを最初から再生し、各局の点数移動と最終状態を返す
export function replay(game, rules) {
  let st = initialState(rules, game.playerIds)
  const seats = game.playerIds
  const steps = []
  for (const h of game.hands) {
    const hand = { ...h, honba: st.honba }
    const { delta, potAfter } = handDeltas(seats, st.dealerIndex, hand, st.pot)
    for (const pid of seats) st.points[pid] += delta[pid]
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

// 半荘の最終持ち点（局ログがあれば再生結果、なければ手入力値）
export function finalPoints(game, rules) {
  if (game.hands && game.hands.length) return replay(game, rules).state.points
  return game.finalPoints || {}
}

// 半荘の順位・スコア（ウマ・オカ込み）
export function gameResults(game, rules) {
  const pts = finalPoints(game, rules)
  const entries = game.playerIds.map((pid, idx) => ({
    playerId: pid,
    points: pts[pid] ?? 0,
    seatIndex: idx,
  }))
  return computeResults(entries, rules)
}

// 入力の合計チェック（配給原点×人数と一致するか）。供託残りは許容。
export function pointsCheck(game, rules) {
  const pts = finalPoints(game, rules)
  const sum = game.playerIds.reduce((a, pid) => a + (pts[pid] ?? 0), 0)
  const expected = rules.startPoints * game.playerIds.length
  return { sum, expected, diff: sum - expected, ok: sum === expected }
}
