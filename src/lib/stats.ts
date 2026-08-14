// 全対局からプレイヤーごとの成績を集計する。
import { gameResults, finalPoints, replay } from './game'
import { agariTotal, round2 } from './scoring'
import type { DB, Game, Player } from './domain'

/** 成績の集計期間: 全期間 / 今日だけ。成績タブ・モニター表示の両方で使う。 */
export type StatsPeriod = 'all' | 'today'

/** 期間で対局を絞り込む（純粋関数）。'today' は date が today と一致するものだけ残す。 */
export function filterGamesByPeriod(games: Game[], period: StatsPeriod, today: string): Game[] {
  return period === 'today' ? games.filter((g) => g.date === today) : games
}

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
  ron: number // ロン和了回数
  tsumo: number // ツモ和了回数
  winHanSum: number // 和了した翻数の合計
  winFuSum: number // 和了した符の合計
  houju: number // 放銃回数
  houjuPts: number // 放銃失点合計
  riichi: number // 立直回数
  riichiAgari: number // 立直宣言と同じ局での和了回数
  dealerHands: number // 親として参加した局数
  dealerAgari: number // 親での和了回数
  dealerAgariPts: number // 親での和了点合計
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
  riichiAgariRate: number | null
  tsumoRate: number | null
  avgHan: number | null
  avgFu: number | null
  avgAgari: number | null
  avgHouju: number | null
  dealerAgariRate: number | null
  avgDealerAgari: number | null
  tenpaiRate: number | null
}

/** 半荘ごとのスコアと、その時点までの累計スコア。表示順は db.games の順を維持する。 */
export interface ScoreTrendPoint {
  gameNumber: number
  gameId: string
  date: string
  note: string
  scores: Record<string, number>
  cumulativeScores: Record<string, number>
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
    ron: 0,
    tsumo: 0,
    winHanSum: 0,
    winFuSum: 0,
    houju: 0,
    houjuPts: 0,
    riichi: 0,
    riichiAgari: 0,
    dealerHands: 0,
    dealerAgari: 0,
    dealerAgariPts: 0,
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
      const handCount = game.hands.filter((hand) => hand.type !== 'adjust').length
      for (const pid of seats) {
        const s = byId[pid]
        if (s) s.handsPlayed += handCount
      }
      const { steps } = replay(game, rules)
      for (const step of steps) {
        const h = step.hand
        const dealerId = seats[step.dealerIndex]
        const dealer = dealerId ? byId[dealerId] : undefined
        if (h.type !== 'adjust' && dealer) dealer.dealerHands += 1
        const riichiIds = new Set(h.riichi)
        for (const pid of h.riichi) {
          const s = byId[pid]
          if (s) s.riichi += 1
        }

        const registerWin = (
          playerId: string,
          han: number,
          fu: number,
          points: number,
          winnerIsDealer: boolean,
          isTsumo: boolean,
        ) => {
          const winner = byId[playerId]
          if (!winner) return
          winner.agari += 1
          winner.agariPts += points
          winner.winHanSum += han
          winner.winFuSum += fu
          if (isTsumo) winner.tsumo += 1
          else winner.ron += 1
          if (riichiIds.has(playerId)) winner.riichiAgari += 1
          if (winnerIsDealer) {
            winner.dealerAgari += 1
            winner.dealerAgariPts += points
          }
        }

        if (h.type === 'tsumo') {
          const winnerIsDealer = h.winner === dealerId
          registerWin(
            h.winner,
            h.han,
            h.fu,
            agariTotal(h.han, h.fu, winnerIsDealer, true),
            winnerIsDealer,
            true,
          )
        } else if (h.type === 'ron') {
          // ダブロン・トリプルロンは放銃1回として数え、失点は合算する
          let houjuPts = 0
          for (const win of h.wins) {
            const winnerIsDealer = win.winner === dealerId
            const pts = agariTotal(win.han, win.fu, winnerIsDealer, false)
            registerWin(win.winner, win.han, win.fu, pts, winnerIsDealer, false)
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
        riichiAgariRate: s.riichi ? s.riichiAgari / s.riichi : null,
        tsumoRate: s.agari ? s.tsumo / s.agari : null,
        avgHan: s.agari ? round2(s.winHanSum / s.agari) : null,
        avgFu: s.agari ? round2(s.winFuSum / s.agari) : null,
        avgAgari: s.agari ? Math.round(s.agariPts / s.agari) : null,
        avgHouju: s.houju ? Math.round(s.houjuPts / s.houju) : null,
        dealerAgariRate: s.dealerHands ? s.dealerAgari / s.dealerHands : null,
        avgDealerAgari: s.dealerAgari ? Math.round(s.dealerAgariPts / s.dealerAgari) : null,
        tenpaiRate: s.draws ? s.drawTenpai / s.draws : null,
      }
    })

  list.sort((a, b) => b.totalScore - a.totalScore)
  return list
}

/** 対局ごとのスコアを、表示中の期間における累計へ変換する。 */
export function computeScoreTrend(db: DB): ScoreTrendPoint[] {
  const cumulative: Record<string, number> = {}

  return db.games.map((game, index) => {
    const scores: Record<string, number> = {}
    for (const result of gameResults(game, db.rules)) {
      scores[result.playerId] = result.score
      cumulative[result.playerId] = round2((cumulative[result.playerId] ?? 0) + result.score)
    }

    return {
      gameNumber: index + 1,
      gameId: game.id,
      date: game.date,
      note: game.note,
      scores,
      cumulativeScores: { ...cumulative },
    }
  })
}
