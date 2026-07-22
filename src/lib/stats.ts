// 全対局からプレイヤーごとの成績を集計する。
import { gameResults, finalPoints, replay } from './game'
import { agariTotal, round2 } from './scoring'
import type { DB, Player } from './domain'

/** 集計の途中で貯める生カウント */
interface StatAcc {
  playerId: string
  name: string
  games: number // 対局数
  totalScore: number // 合計スコア
  rankCounts: [number, number, number, number] // 1〜4位回数
  rankSum: number // 順位の合計（平均順位用）
  rawSum: number // 素点の合計（平均素点用）
  tobi: number // トビ（箱下）回数
  // 局ログ由来
  handsPlayed: number // 参加局数（局ログのある半荘のみ）
  agari: number // 和了回数
  agariPts: number // 和了点合計
  tsumo: number // ツモ和了回数
  houju: number // 放銃回数
  houjuPts: number // 放銃失点合計
  riichi: number // 立直回数
  draws: number // 参加した流局数
  drawTenpai: number // うちテンパイ回数
}

/** 画面に出す派生値込みの成績。率系は算出不能なとき null。 */
export interface PlayerStats extends StatAcc {
  avgScore: number
  avgRank: number
  avgRaw: number
  topRate: number
  rentaiRate: number
  lastRate: number
  lastAvoidRate: number
  tobiRate: number
  agariRate: number | null
  houjuRate: number | null
  riichiRate: number | null
  tsumoRate: number | null
  avgAgari: number | null
  avgHouju: number | null
  tenpaiRate: number | null
}

function emptyAcc(player: Pick<Player, 'id' | 'name'>): StatAcc {
  return {
    playerId: player.id,
    name: player.name,
    games: 0,
    totalScore: 0,
    rankCounts: [0, 0, 0, 0],
    rankSum: 0,
    rawSum: 0,
    tobi: 0,
    handsPlayed: 0,
    agari: 0,
    agariPts: 0,
    tsumo: 0,
    houju: 0,
    houjuPts: 0,
    riichi: 0,
    draws: 0,
    drawTenpai: 0,
  }
}

export function computeStats(db: DB): PlayerStats[] {
  const rules = db.rules
  const byId: Record<string, StatAcc> = {}
  for (const p of db.players) byId[p.id] = emptyAcc(p)

  for (const game of db.games) {
    // 未登録プレイヤーが混じる古いデータの受け皿
    for (const pid of game.playerIds) {
      if (!byId[pid]) byId[pid] = emptyAcc({ id: pid, name: '(削除されたメンバー)' })
    }

    const results = gameResults(game, rules)
    const pts = finalPoints(game, rules)
    for (const r of results) {
      const s = byId[r.playerId]
      if (!s) continue
      s.games += 1
      s.totalScore += r.score
      s.rankCounts[r.rank - 1]! += 1
      s.rankSum += r.rank
      s.rawSum += r.points
      if ((pts[r.playerId] ?? 0) < 0) s.tobi += 1
    }

    // 局ログの集計（親の特定は replay の各局結果を使う）
    if (game.hands.length) {
      const seats = game.playerIds
      for (const pid of seats) {
        const s = byId[pid]
        if (s) s.handsPlayed += game.hands.length
      }
      const { steps } = replay(game, rules)
      for (const step of steps) {
        const h = step.hand
        const dealerId = seats[step.dealerIndex]
        for (const pid of h.riichi) {
          const s = byId[pid]
          if (s) s.riichi += 1
        }
        if (h.type === 'tsumo') {
          const winnerIsDealer = h.winner === dealerId
          const w = byId[h.winner]
          if (w) {
            w.agari += 1
            w.agariPts += agariTotal(h.han, h.fu, winnerIsDealer, true)
            w.tsumo += 1
          }
        } else if (h.type === 'ron') {
          // ダブロン・トリプルロンは放銃1回として数え、失点は合算する
          let houjuPts = 0
          for (const win of h.wins) {
            const winnerIsDealer = win.winner === dealerId
            const w = byId[win.winner]
            const pts = agariTotal(win.han, win.fu, winnerIsDealer, false)
            if (w) {
              w.agari += 1
              w.agariPts += pts
            }
            houjuPts += pts
          }
          const l = byId[h.loser]
          if (l) {
            l.houju += 1
            l.houjuPts += houjuPts
          }
        } else if (h.type === 'draw') {
          for (const pid of seats) {
            const s = byId[pid]
            if (!s) continue
            s.draws += 1
            if (h.tenpai.includes(pid)) s.drawTenpai += 1
          }
        }
      }
    }
  }

  const list: PlayerStats[] = Object.values(byId)
    .filter((s) => s.games > 0)
    .map((s) => {
      const g = s.games
      const hp = s.handsPlayed
      return {
        ...s,
        totalScore: round2(s.totalScore),
        avgScore: round2(s.totalScore / g),
        avgRank: round2(s.rankSum / g),
        avgRaw: Math.round(s.rawSum / g),
        topRate: s.rankCounts[0] / g,
        rentaiRate: (s.rankCounts[0] + s.rankCounts[1]) / g, // 連対（2位以内）
        lastRate: s.rankCounts[3] / g, // ラス
        lastAvoidRate: 1 - s.rankCounts[3] / g,
        tobiRate: s.tobi / g,
        agariRate: hp ? s.agari / hp : null,
        houjuRate: hp ? s.houju / hp : null,
        riichiRate: hp ? s.riichi / hp : null,
        tsumoRate: s.agari ? s.tsumo / s.agari : null,
        avgAgari: s.agari ? Math.round(s.agariPts / s.agari) : null,
        avgHouju: s.houju ? Math.round(s.houjuPts / s.houju) : null,
        tenpaiRate: s.draws ? s.drawTenpai / s.draws : null,
      }
    })

  list.sort((a, b) => b.totalScore - a.totalScore)
  return list
}
