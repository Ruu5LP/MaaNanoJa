import type { DB } from './domain'

const INITIAL_PLAYER_NAMES = ['ユーザー1', 'ユーザー2', 'ユーザー3', 'ユーザー4']

/** 初回利用時に、あとから名前を変更できる4人分の仮メンバーを用意する。 */
export function prepareInitialPlayers(db: DB): DB {
  if (db.players.length > 0 || db.games.length > 0 || db.draft !== null) return db

  return {
    ...db,
    players: INITIAL_PLAYER_NAMES.map((name, index) => ({
      id: `p-${index + 1}`,
      name,
    })),
  }
}
