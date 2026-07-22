import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeResults, handValue, handDeltas, round2 } from './scoring.js'

const RULES = { startPoints: 25000, returnPoints: 30000, uma: [30, 10, -10, -30] }
const NAMES = ['れいに', 'もっそ', 'さーりゃん', '超髪']

// 既存スプレッドシート「点数入力」の9試合（最終持ち点）
const GAMES = [
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

// 既存スプレッドシート「スコア整理(計算用)」の期待スコア
const EXPECTED = [
  [0.9, 77.6, -25.7, -52.8],
  [-7.3, -64.5, 56, 15.8],
  [1.1, -30.5, 89.5, -60.1],
  [-17.9, 12.8, -61.4, 66.5],
  [-19.1, -60.3, 6.1, 73.3],
  [-16.5, 70.8, -60.8, 6.5],
  [-45, -20.5, 11.4, 54.1],
  [-45.1, -15.8, 53.9, 7],
  [-18.2, 9, -41.3, 50.5],
]

test('9試合すべてのスコアが既存スプレッドシートと一致する', () => {
  GAMES.forEach((points, gi) => {
    const entries = points.map((p, idx) => ({ playerId: NAMES[idx], points: p, seatIndex: idx }))
    const results = computeResults(entries, RULES)
    const byPlayer = Object.fromEntries(results.map((r) => [r.playerId, r.score]))
    NAMES.forEach((name, idx) => {
      assert.equal(byPlayer[name], EXPECTED[gi][idx], `game${gi + 1} ${name}`)
    })
    // ゼロサムであること
    const sum = round2(results.reduce((a, r) => a + r.score, 0))
    assert.equal(sum, 0, `game${gi + 1} zero-sum`)
  })
})

test('和了点の早見表（代表値）', () => {
  // 子 30符4翻 = 7700 / 親 = 11600
  assert.equal(handValue(4, 30).ronNonDealer, 7700)
  assert.equal(handValue(4, 30).ronDealer, 11600)
  // 満貫 子ロン8000 / 親ロン12000
  assert.equal(handValue(5, 30).ronNonDealer, 8000)
  assert.equal(handValue(5, 30).ronDealer, 12000)
  // 子 20符2翻ツモ = 400/700
  assert.equal(handValue(2, 20).tsumoNonDealer, 400)
  assert.equal(handValue(2, 20).tsumoDealer, 700)
  // 子 40符3翻 = 5200 ロン
  assert.equal(handValue(3, 40).ronNonDealer, 5200)
})

test('局の点数移動: 子のロン（本場・供託あり）', () => {
  const seats = ['A', 'B', 'C', 'D'] // A=起家(親)
  // BがCから子ロン 40符3翻(5200)、2本場、供託0、この局Bが立直
  const hand = { type: 'ron', winner: 'B', loser: 'C', han: 3, fu: 40, honba: 2, riichi: ['B'] }
  const { delta, potAfter } = handDeltas(seats, 0, hand, 1000)
  // B: -1000(立直) +5200 +600(本場) +2000(供託=前1000+自分1000) = 6800 - 1000 = ... 計算
  // Bの立直棒-1000 → deltaB=-1000, pot=2000。ロン: +5200+600+2000 → deltaB = -1000+7800=6800
  assert.equal(delta['B'], 6800)
  assert.equal(delta['C'], -(5200 + 600))
  assert.equal(delta['A'], 0)
  assert.equal(delta['D'], 0)
  assert.equal(potAfter, 0)
  // 前局の供託1000が場に残っていた分、この局はテーブル全体で+1000になる（正常）
  assert.equal(delta.A + delta.B + delta.C + delta.D, 1000)
})

test('局の点数移動: 親のツモ（満貫 4000オール）', () => {
  const seats = ['A', 'B', 'C', 'D'] // A=親
  const hand = { type: 'tsumo', winner: 'A', han: 5, fu: 30, honba: 0, riichi: [] }
  const { delta } = handDeltas(seats, 0, hand, 0)
  assert.equal(delta['A'], 12000)
  assert.equal(delta['B'], -4000)
  assert.equal(delta['C'], -4000)
  assert.equal(delta['D'], -4000)
})

test('流局: テンパイ2人ノーテン2人', () => {
  const seats = ['A', 'B', 'C', 'D']
  const hand = { type: 'draw', tenpai: ['A', 'B'], riichi: [] }
  const { delta } = handDeltas(seats, 0, hand, 0)
  assert.equal(delta['A'], 1500)
  assert.equal(delta['B'], 1500)
  assert.equal(delta['C'], -1500)
  assert.equal(delta['D'], -1500)
})
