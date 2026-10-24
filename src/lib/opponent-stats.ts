// 相手別の点数移動。基本点・本場・供託を混同せず、和了者ごとに保持する。
import type { DB, Player } from './domain'
import { replay } from './game'
import { agariTotal, handDeltas } from './scoring'

export interface RonTransfer {
  gameId: string
  gameNumber: number
  date: string
  handId: string
  label: string
  loserId: string
  winnerId: string
  base: number
  honba: number
  pot: number
  /** 選択者の受取または支払。支払には供託を含めない。 */
  total: number
  direction: 'ron' | 'houju'
}

export interface TransferTotals {
  count: number
  base: number
  honba: number
  pot: number
}

export interface OpponentStats {
  opponent: Player
  ron: TransferTotals
  houju: TransferTotals
  netBase: number
}

function emptyTotals(): TransferTotals {
  return { count: 0, base: 0, honba: 0, pot: 0 }
}

/** 期間を絞り込み済みのDBから、選択者に関係するロンだけを取り出す。 */
export function computeOpponentStats(db: DB, playerId: string) {
  const names = new Map(db.players.map((player) => [player.id, player.name]))
  const opponents = new Map<string, OpponentStats>()
  const details: RonTransfer[] = []

  db.games.forEach((game, gameIndex) => {
    if (!game.playerIds.includes(playerId)) return
    for (const id of game.playerIds) {
      if (id !== playerId && !opponents.has(id)) {
        opponents.set(id, {
          opponent: { id, name: names.get(id) ?? '削除されたメンバー' },
          ron: emptyTotals(),
          houju: emptyTotals(),
          netBase: 0,
        })
      }
    }

    let potBefore = 0
    for (const step of replay(game, db.rules).steps) {
      const hand = step.hand
      const pot = potBefore + hand.riichi.length * 1000
      potBefore = handDeltas(game.playerIds, step.dealerIndex, hand, step.honba, potBefore).potAfter
      if (hand.type !== 'ron') continue

      hand.wins.forEach((win, winIndex) => {
        if (hand.loser !== playerId && win.winner !== playerId) return
        const direction = win.winner === playerId ? 'ron' : 'houju'
        const opponentId = direction === 'ron' ? hand.loser : win.winner
        const opponent = opponents.get(opponentId)
        if (!opponent) return
        const base = agariTotal(
          win.han,
          win.fu,
          win.winner === game.playerIds[step.dealerIndex],
          false,
        )
        const honba = step.honba * 300
        // 供託は最初の和了者だけが受け取る。放銃者の追加支払ではない。
        const potShare = winIndex === 0 ? pot : 0
        const totals = opponent[direction]
        totals.count += 1
        totals.base += base
        totals.honba += honba
        totals.pot += potShare
        opponent.netBase = opponent.ron.base - opponent.houju.base
        details.push({
          gameId: game.id,
          gameNumber: gameIndex + 1,
          date: game.date,
          handId: hand.id,
          label: step.label,
          loserId: hand.loser,
          winnerId: win.winner,
          base,
          honba,
          pot: potShare,
          total: base + honba + (direction === 'ron' ? potShare : 0),
          direction,
        })
      })
    }
  })

  return { opponents: [...opponents.values()], details }
}
