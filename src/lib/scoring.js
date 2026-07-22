// 麻雀のスコア計算まわり。
// - 半荘の最終持ち点 → 順位・ウマ・オカ・スコア（既存スプレッドシートと同じ計算）
// - 局ごとの和了/流局 → 各家の点数移動（自動集計用）
//
// スコアの単位は「点数 ÷ 1000」（例: +30.0）。既存ツールと合わせてある。

/** 100点単位で切り上げ */
export function ceil100(x) {
  return Math.ceil(x / 100) * 100
}

/**
 * 翻・符から基本点(base)を求める。
 * 満貫以上は翻数で固定。
 */
export function basePoints(han, fu) {
  if (han >= 13) return 8000 // 役満
  if (han >= 11) return 6000 // 三倍満
  if (han >= 8) return 4000 // 倍満
  if (han >= 6) return 3000 // 跳満
  if (han >= 5) return 2000 // 満貫
  const base = fu * Math.pow(2, 2 + han)
  return Math.min(base, 2000) // 4翻30符・3翻60符などは満貫に丸める
}

/**
 * 和了点の内訳を返す。
 * @returns {{ronNonDealer:number, ronDealer:number, tsumoNonDealer:number, tsumoDealer:number, tsumoEachDealer:number}}
 *   ronNonDealer      : 子のロン和了点（放銃者が払う総額）
 *   ronDealer         : 親のロン和了点
 *   tsumoNonDealer    : 子ツモ時、子1人が払う額
 *   tsumoDealer       : 子ツモ時、親が払う額
 *   tsumoEachDealer   : 親ツモ時、子1人が払う額
 */
export function handValue(han, fu) {
  const base = basePoints(han, fu)
  return {
    ronNonDealer: ceil100(base * 4),
    ronDealer: ceil100(base * 6),
    tsumoNonDealer: ceil100(base),
    tsumoDealer: ceil100(base * 2),
    tsumoEachDealer: ceil100(base * 2),
  }
}

/**
 * 和了点（合計）の表示用。
 */
export function agariTotal(han, fu, winnerIsDealer, isTsumo) {
  const v = handValue(han, fu)
  if (!isTsumo) return winnerIsDealer ? v.ronDealer : v.ronNonDealer
  if (winnerIsDealer) return v.tsumoEachDealer * 3
  return v.tsumoNonDealer * 2 + v.tsumoDealer
}

/**
 * 1局分の点数移動を計算する。
 * seats: プレイヤーIDの配列（起家=index0, 東南西北の並び）
 * dealerIndex: 親のseat index
 * hand: {
 *   type: 'tsumo'|'ron'|'draw'|'abortive',
 *   winner, loser (ronのみ),
 *   han, fu,
 *   honba: 本場,
 *   riichi: [playerId...]   // この局で立直した人
 *   tenpai: [playerId...]   // 流局時テンパイ者
 * }
 * potBefore: この局開始時点で場に残っている供託リーチ棒の合計点(1000単位ではなく点数)
 * @returns {{ delta: {[pid]:number}, potAfter:number }}
 */
export function handDeltas(seats, dealerIndex, hand, potBefore = 0) {
  const delta = {}
  for (const pid of seats) delta[pid] = 0

  const riichi = hand.riichi || []
  // 立直棒: 各1000点を場に出す
  let pot = potBefore
  for (const pid of riichi) {
    delta[pid] -= 1000
    pot += 1000
  }

  const dealerId = seats[dealerIndex]
  const honba = hand.honba || 0

  if (hand.type === 'ron') {
    const winnerIsDealer = hand.winner === dealerId
    const v = handValue(hand.han, hand.fu)
    const gain = winnerIsDealer ? v.ronDealer : v.ronNonDealer
    const honbaPay = honba * 300
    delta[hand.winner] += gain + honbaPay + pot
    delta[hand.loser] -= gain + honbaPay
    pot = 0
  } else if (hand.type === 'tsumo') {
    const winnerIsDealer = hand.winner === dealerId
    const v = handValue(hand.han, hand.fu)
    const honbaEach = honba * 100
    let total = 0
    for (const pid of seats) {
      if (pid === hand.winner) continue
      let pay
      if (winnerIsDealer) pay = v.tsumoEachDealer
      else pay = pid === dealerId ? v.tsumoDealer : v.tsumoNonDealer
      pay += honbaEach
      delta[pid] -= pay
      total += pay
    }
    delta[hand.winner] += total + pot
    pot = 0
  } else if (hand.type === 'draw') {
    // 流局: テンパイ者とノーテン者で3000点をやり取り。供託は場に残す。
    const tenpai = hand.tenpai || []
    const n = tenpai.length
    if (n > 0 && n < 4) {
      const receive = 3000 / n
      const pay = 3000 / (4 - n)
      for (const pid of seats) {
        if (tenpai.includes(pid)) delta[pid] += receive
        else delta[pid] -= pay
      }
    }
    // abortive(途中流局)は点数移動なし・供託据え置き
  }

  return { delta, potAfter: pot }
}

/**
 * 半荘の最終持ち点から順位・スコアを計算する（既存スプレッドシートと同じ）。
 *
 * entries: [{ playerId, points, seatIndex }]  seatIndex は起家順(0..)。同点時の上家優先に使う。
 * rules: { startPoints, returnPoints, uma:[r1,r2,r3,r4] }
 *   オカは (returnPoints - startPoints) * 人数 / 1000 をトップに加算。
 *
 * @returns [{ playerId, points, rank, raw, score }]  raw=素点スコア, score=ウマオカ込み(単位:÷1000)
 */
export function computeResults(entries, rules) {
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
      playerId: e.playerId,
      points: e.points,
      seatIndex: e.seatIndex,
      rank,
      raw: round2(raw),
      score: round2(score),
    }
  })
}

export function round2(x) {
  const r = Math.round(x * 100) / 100
  return r === 0 ? 0 : r // -0 を 0 に正規化
}
