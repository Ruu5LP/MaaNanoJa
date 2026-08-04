import { replay } from './game'
import type { DB, Draft, Player, Rules } from './domain'

export interface DraftPlayerPoints {
  playerId: string
  name: string
  points: number
  seatIndex: number
}

function numeric(value: unknown, fallback: number): number {
  if (typeof value === 'string' && value.trim() === '') return fallback
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : fallback
}

/** 進行中の半荘を、モニター表示用の現在点に変換する純粋関数。 */
export function currentDraftPoints(
  draft: Draft,
  players: Player[],
  rules: Rules,
): DraftPlayerPoints[] {
  const game = { ...draft, id: 'draft' }
  const points =
    draft.mode === 'live'
      ? replay(game, rules).state.points
      : Object.fromEntries(
          draft.playerIds.map((pid) => [
            pid,
            numeric(draft.quickPoints?.[pid] ?? draft.finalPoints[pid], rules.startPoints),
          ]),
        )
  const names = new Map(players.map((player) => [player.id, player.name]))

  return draft.playerIds
    .map((playerId, seatIndex) => ({
      playerId,
      name: names.get(playerId) ?? '(削除されたメンバー)',
      points: numeric(points[playerId], rules.startPoints),
      seatIndex,
    }))
    .sort((a, b) => b.points - a.points || a.seatIndex - b.seatIndex)
}

export function currentDraftPointsFromDB(db: DB): DraftPlayerPoints[] | null {
  return db.draft ? currentDraftPoints(db.draft, db.players, db.rules) : null
}
