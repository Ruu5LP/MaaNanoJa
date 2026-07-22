// 全対局からプレイヤーごとの成績を集計する。
import { gameResults, finalPoints } from './game.js'
import { agariTotal, round2 } from './scoring.js'

function emptyStat(player) {
  return {
    playerId: player.id,
    name: player.name,
    games: 0, // 対局数
    totalScore: 0, // 合計スコア
    rankCounts: [0, 0, 0, 0], // 1〜4位回数
    rankSum: 0, // 順位の合計（平均順位用）
    rawSum: 0, // 素点の合計（平均素点用）
    tobi: 0, // トビ（箱下）回数
    // 局ログ由来
    handsPlayed: 0, // 参加局数（局ログのある半荘のみ）
    agari: 0, // 和了回数
    agariPts: 0, // 和了点合計
    tsumo: 0, // ツモ和了回数
    houju: 0, // 放銃回数
    houjuPts: 0, // 放銃失点合計
    riichi: 0, // 立直回数
    draws: 0, // 参加した流局数
    drawTenpai: 0, // うちテンパイ回数
  }
}

export function computeStats(db) {
  const rules = db.rules
  const byId = {}
  for (const p of db.players) byId[p.id] = emptyStat(p)

  for (const game of db.games) {
    if (!game.playerIds?.every((pid) => byId[pid])) {
      // 未登録プレイヤーが混じる古いデータはスキップ用の受け皿を作る
      for (const pid of game.playerIds || []) {
        if (!byId[pid]) byId[pid] = emptyStat({ id: pid, name: '(削除されたメンバー)' })
      }
    }

    const results = gameResults(game, rules)
    const pts = finalPoints(game, rules)
    for (const r of results) {
      const s = byId[r.playerId]
      if (!s) continue
      s.games += 1
      s.totalScore += r.score
      s.rankCounts[r.rank - 1] += 1
      s.rankSum += r.rank
      s.rawSum += r.points
      if ((pts[r.playerId] ?? 0) < 0) s.tobi += 1
    }

    // 局ログの集計
    if (game.hands && game.hands.length) {
      const seats = game.playerIds
      for (const pid of seats) {
        if (byId[pid]) byId[pid].handsPlayed += game.hands.length
      }
      // 再生して親を特定するため、gameResults 経由ではなく replay を使う
      // （和了点は翻符から算出）
      let dealerIndex = 0
      let honba = 0
      for (const h of game.hands) {
        const dealerId = seats[dealerIndex]
        // 立直
        for (const pid of h.riichi || []) if (byId[pid]) byId[pid].riichi += 1
        if (h.type === 'ron' || h.type === 'tsumo') {
          const w = byId[h.winner]
          if (w) {
            w.agari += 1
            const winnerIsDealer = h.winner === dealerId
            w.agariPts += agariTotal(h.han, h.fu, winnerIsDealer, h.type === 'tsumo')
            if (h.type === 'tsumo') w.tsumo += 1
          }
          if (h.type === 'ron' && byId[h.loser]) {
            const l = byId[h.loser]
            l.houju += 1
            const winnerIsDealer = h.winner === dealerId
            l.houjuPts += agariTotal(h.han, h.fu, winnerIsDealer, false)
          }
          // 親判定の更新（連荘/親流れ）
          const renchan = h.winner === dealerId
          if (renchan) honba += 1
          else {
            honba = 0
            dealerIndex = (dealerIndex + 1) % seats.length
          }
        } else if (h.type === 'draw') {
          for (const pid of seats) {
            if (!byId[pid]) continue
            byId[pid].draws += 1
            if ((h.tenpai || []).includes(pid)) byId[pid].drawTenpai += 1
          }
          const renchan = (h.tenpai || []).includes(dealerId)
          if (renchan) honba += 1
          else {
            honba = 0
            dealerIndex = (dealerIndex + 1) % seats.length
          }
        } else {
          // 途中流局
          honba += 1
        }
      }
    }
  }

  // 率などの派生値
  const list = Object.values(byId)
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

  // 合計スコア降順
  list.sort((a, b) => b.totalScore - a.totalScore)
  return list
}
