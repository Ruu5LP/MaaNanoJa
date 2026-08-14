import type { DB, Draft, Game, Player, Rules } from './domain'
import { prepareInitialPlayers } from './initial-players'

export const ROOM_QUERY_KEY = 'room'
export const ROOM_CODE_LENGTH = 8
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export interface RoomState {
  players: Player[]
  rules: Rules
  draft: Draft | null
}

export interface RoomSnapshot {
  roomCode: string
  revision: number
  state: RoomState
  games: Game[]
}

export interface RoomStatePayload {
  revision: number
  state: RoomState
}

export interface RoomCreationOptions {
  migrateGames: boolean
}

export interface RoomCreationPayload {
  state: RoomState
  games: Game[]
}

export interface RoomGamePayload {
  revision: number
  game: Game
}

/** URL入力やAPI境界のroom codeを、保存・照合用の形へ正規化する。 */
export function normalizeRoomCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  return isRoomCode(code) ? code : null
}

export function isRoomCode(value: string): boolean {
  if (value.length !== ROOM_CODE_LENGTH) return false
  return [...value].every((char) => ROOM_CODE_ALPHABET.includes(char))
}

export function toRoomState(db: DB): RoomState {
  return {
    players: db.players,
    rules: db.rules,
    draft: db.draft,
  }
}

export function toRoomCreationPayload(db: DB, options: RoomCreationOptions): RoomCreationPayload {
  const prepared = prepareInitialPlayers(db)
  return {
    state: toRoomState(prepared),
    games: options.migrateGames ? prepared.games : [],
  }
}

export function fromRoomSnapshot(snapshot: RoomSnapshot, version: number): DB {
  return {
    version,
    players: snapshot.state.players,
    rules: snapshot.state.rules,
    draft: snapshot.state.draft,
    games: snapshot.games,
  }
}

export function isNewerRoomSnapshot(snapshot: RoomSnapshot, revision: number): boolean {
  return snapshot.revision > revision
}
