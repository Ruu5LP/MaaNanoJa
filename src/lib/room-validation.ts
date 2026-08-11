import type {
  AbortiveHand,
  AdjustHand,
  DB,
  Draft,
  DrawHand,
  Game,
  Hand,
  HandFormState,
  Player,
  Rules,
  RonHand,
  TsumoHand,
} from './domain'
import type { RoomSnapshot, RoomState } from './cloud-room'

export const MAX_PLAYERS = 4
export const MAX_GAMES = 5_000
export const MAX_HANDS = 200
export const MAX_TEXT_LENGTH = 2_000
export const MAX_ID_LENGTH = 100
export const MAX_POINTS = 1_000_000
export const MAX_HAN = 13
export const MAX_FU = 110

export const DEFAULT_VALIDATION_RULES: Rules = {
  startPoints: 25_000,
  returnPoints: 30_000,
  uma: [30, 10, -10, -30],
  tiebreak: 'shimocha',
}

export class RoomValidationError extends Error {
  constructor(
    message: string,
    readonly path = '',
  ) {
    super(path ? `${path}: ${message}` : message)
    this.name = 'RoomValidationError'
  }
}

type RecordValue = Record<string, unknown>

function fail(message: string, path = ''): never {
  throw new RoomValidationError(message, path)
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredRecord(value: unknown, path: string): RecordValue {
  if (!isRecord(value)) fail('オブジェクトが必要です', path)
  return value
}

function requiredString(value: unknown, path: string, max = MAX_TEXT_LENGTH): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    fail('文字列が不正です', path)
  }
  return value
}

function optionalText(value: unknown, path: string, max = MAX_TEXT_LENGTH): string {
  if (value === undefined) return ''
  if (typeof value !== 'string' || value.length > max) fail('文字列が不正です', path)
  return value
}

function integer(value: unknown, path: string, min = -MAX_POINTS, max = MAX_POINTS): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
    fail('整数値が不正です', path)
  }
  return value
}

function positiveInteger(value: unknown, path: string, max = MAX_POINTS): number {
  return integer(value, path, 1, max)
}

function uniqueStrings(value: unknown, path: string, max: number): string[] {
  if (!Array.isArray(value) || value.length > max) fail('配列が不正です', path)
  const result = value.map((item, index) =>
    requiredString(item, `${path}[${index}]`, MAX_ID_LENGTH),
  )
  if (new Set(result).size !== result.length) fail('重複したIDがあります', path)
  return result
}

function boundedArray(value: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) fail('配列が不正です', path)
  return value
}

function dateString(value: unknown, path: string): string {
  if (value === '') return ''
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail('日付が不正です', path)
  }
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    fail('日付が不正です', path)
  }
  return value
}

function playerIds(value: unknown, path: string): string[] {
  const ids = uniqueStrings(value, path, MAX_PLAYERS)
  if (ids.length !== MAX_PLAYERS) fail('4人のプレイヤーが必要です', path)
  return ids
}

function parsePlayer(value: unknown, path: string): Player {
  const record = requiredRecord(value, path)
  return {
    id: requiredString(record.id, `${path}.id`, MAX_ID_LENGTH),
    name: requiredString(record.name, `${path}.name`, 120).trim(),
  }
}

function parsePlayers(value: unknown): Player[] {
  const values = boundedArray(value, 'players', MAX_PLAYERS)
  const players = values.map((item, index) => parsePlayer(item, `players[${index}]`))
  if (new Set(players.map((player) => player.id)).size !== players.length) {
    fail('プレイヤーIDが重複しています', 'players')
  }
  if (players.some((player) => player.name.length === 0)) fail('プレイヤー名が空です', 'players')
  if (new Set(players.map((player) => player.name)).size !== players.length) {
    fail('プレイヤー名が重複しています', 'players')
  }
  return players
}

function parseRules(value: unknown, allowDefaults: boolean): Rules {
  const record = requiredRecord(value, 'rules')
  const startValue =
    record.startPoints === undefined && allowDefaults
      ? DEFAULT_VALIDATION_RULES.startPoints
      : record.startPoints
  const returnValue =
    record.returnPoints === undefined && allowDefaults
      ? DEFAULT_VALIDATION_RULES.returnPoints
      : record.returnPoints
  const umaValue =
    record.uma === undefined && allowDefaults ? DEFAULT_VALIDATION_RULES.uma : record.uma
  const tiebreakValue =
    record.tiebreak === undefined && allowDefaults
      ? DEFAULT_VALIDATION_RULES.tiebreak
      : record.tiebreak
  const uma = boundedArray(umaValue, 'rules.uma', MAX_PLAYERS).map((item, index) =>
    integer(item, `rules.uma[${index}]`, -MAX_POINTS, MAX_POINTS),
  )
  if (uma.length !== MAX_PLAYERS) fail('ウマは4つ必要です', 'rules.uma')
  const startPoints = positiveInteger(startValue, 'rules.startPoints')
  const returnPoints = positiveInteger(returnValue, 'rules.returnPoints')
  if (tiebreakValue !== 'shimocha') fail('同点ルールが不正です', 'rules.tiebreak')
  return {
    startPoints,
    returnPoints,
    uma: uma as Rules['uma'],
    tiebreak: 'shimocha',
  }
}

function assertKnown(id: string, known: Set<string> | undefined, path: string): void {
  if (known && !known.has(id)) fail('存在しないプレイヤーIDです', path)
}

function parseHand(value: unknown, path: string, known?: Set<string>): Hand {
  const record = requiredRecord(value, path)
  const id = requiredString(record.id, `${path}.id`, MAX_ID_LENGTH)
  const riichi = uniqueStrings(record.riichi, `${path}.riichi`, MAX_PLAYERS)
  riichi.forEach((playerId, index) => assertKnown(playerId, known, `${path}.riichi[${index}]`))
  const honbaOverride =
    record.honbaOverride === undefined
      ? undefined
      : integer(record.honbaOverride, `${path}.honbaOverride`, 0, 1_000)
  const base = { id, riichi, ...(honbaOverride === undefined ? {} : { honbaOverride }) }

  if (record.type === 'ron') {
    const wins = boundedArray(record.wins, `${path}.wins`, MAX_PLAYERS)
    if (wins.length === 0) fail('ロンの和了者がありません', `${path}.wins`)
    const parsedWins = wins.map((item, index) => {
      const win = requiredRecord(item, `${path}.wins[${index}]`)
      const winner = requiredString(win.winner, `${path}.wins[${index}].winner`, MAX_ID_LENGTH)
      assertKnown(winner, known, `${path}.wins[${index}].winner`)
      return {
        winner,
        han: integer(win.han, `${path}.wins[${index}].han`, 1, MAX_HAN),
        fu: integer(win.fu, `${path}.wins[${index}].fu`, 20, MAX_FU),
      }
    })
    if (new Set(parsedWins.map((win) => win.winner)).size !== parsedWins.length) {
      fail('ロンの和了者が重複しています', `${path}.wins`)
    }
    const loser = requiredString(record.loser, `${path}.loser`, MAX_ID_LENGTH)
    assertKnown(loser, known, `${path}.loser`)
    if (parsedWins.some((win) => win.winner === loser)) fail('和了者と放銃者が同じです', path)
    return { ...base, type: 'ron', wins: parsedWins, loser } satisfies RonHand
  }

  if (record.type === 'tsumo') {
    const winner = requiredString(record.winner, `${path}.winner`, MAX_ID_LENGTH)
    assertKnown(winner, known, `${path}.winner`)
    return {
      ...base,
      type: 'tsumo',
      winner,
      han: integer(record.han, `${path}.han`, 1, MAX_HAN),
      fu: integer(record.fu, `${path}.fu`, 20, MAX_FU),
    } satisfies TsumoHand
  }

  if (record.type === 'draw') {
    const tenpai = uniqueStrings(record.tenpai, `${path}.tenpai`, MAX_PLAYERS)
    tenpai.forEach((playerId, index) => assertKnown(playerId, known, `${path}.tenpai[${index}]`))
    return { ...base, type: 'draw', tenpai } satisfies DrawHand
  }

  if (record.type === 'abortive') {
    return { ...base, type: 'abortive' } satisfies AbortiveHand
  }

  if (record.type === 'adjust') {
    const deltaRecord = requiredRecord(record.delta, `${path}.delta`)
    const delta: Record<string, number> = {}
    for (const [playerId, amount] of Object.entries(deltaRecord)) {
      if (playerId.length > MAX_ID_LENGTH) fail('IDが長すぎます', `${path}.delta`)
      assertKnown(playerId, known, `${path}.delta.${playerId}`)
      delta[playerId] = integer(amount, `${path}.delta.${playerId}`)
    }
    return { ...base, type: 'adjust', delta } satisfies AdjustHand
  }

  fail('局タイプが不正です', `${path}.type`)
}

function parseFinalPoints(value: unknown, ids: string[], path: string): Record<string, number> {
  const record = requiredRecord(value, path)
  const result: Record<string, number> = {}
  for (const id of ids) {
    result[id] = integer(record[id], `${path}.${id}`)
  }
  for (const key of Object.keys(record)) {
    if (!ids.includes(key)) fail('存在しないプレイヤーIDがあります', `${path}.${key}`)
  }
  return result
}

function parseHandForm(value: unknown, path: string, ids: Set<string>): HandFormState {
  const record = requiredRecord(value, path)
  const type = record.type
  if (type !== 'ron' && type !== 'tsumo' && type !== 'draw' && type !== 'abortive') {
    fail('局タイプが不正です', `${path}.type`)
  }
  const winners = uniqueStrings(record.winners, `${path}.winners`, MAX_PLAYERS)
  const loser = typeof record.loser === 'string' ? record.loser : ''
  if (loser.length > MAX_ID_LENGTH) fail('IDが長すぎます', `${path}.loser`)
  winners.forEach((id, index) => assertKnown(id, ids, `${path}.winners[${index}]`))
  if (loser) assertKnown(loser, ids, `${path}.loser`)
  const scoresRecord = requiredRecord(record.scores, `${path}.scores`)
  const scores: Record<string, { han: number; fu: number }> = {}
  for (const [id, scoreValue] of Object.entries(scoresRecord)) {
    assertKnown(id, ids, `${path}.scores.${id}`)
    const score = requiredRecord(scoreValue, `${path}.scores.${id}`)
    scores[id] = {
      han: integer(score.han, `${path}.scores.${id}.han`, 1, MAX_HAN),
      fu: integer(score.fu, `${path}.scores.${id}.fu`, 20, MAX_FU),
    }
  }
  const riichi = uniqueStrings(record.riichi, `${path}.riichi`, MAX_PLAYERS)
  const tenpai = uniqueStrings(record.tenpai, `${path}.tenpai`, MAX_PLAYERS)
  riichi.forEach((id, index) => assertKnown(id, ids, `${path}.riichi[${index}]`))
  tenpai.forEach((id, index) => assertKnown(id, ids, `${path}.tenpai[${index}]`))
  return { type, winners, loser, scores, riichi, tenpai }
}

function parseDraft(value: unknown, players: Set<string>): Draft {
  const record = requiredRecord(value, 'draft')
  const mode = record.mode
  if (mode !== 'live' && mode !== 'quick') fail('対局モードが不正です', 'draft.mode')
  const playerIds = playerIdsValue(record.playerIds, 'draft.playerIds')
  playerIds.forEach((id, index) => assertKnown(id, players, `draft.playerIds[${index}]`))
  const handsValues = boundedArray(record.hands, 'draft.hands', MAX_HANDS)
  const hands = handsValues.map((item, index) =>
    parseHand(item, `draft.hands[${index}]`, new Set(playerIds)),
  )
  const rules = record.rules === undefined ? undefined : parseRules(record.rules, false)
  const finalPoints = parseFinalPoints(record.finalPoints, playerIds, 'draft.finalPoints')
  const form =
    record.form === null || record.form === undefined
      ? null
      : parseHandForm(record.form, 'draft.form', new Set(playerIds))
  const quickPoints = parseStringMap(record.quickPoints, 'draft.quickPoints', playerIds, 40)
  const pointsEdit = parseStringMap(record.pointsEdit, 'draft.pointsEdit', playerIds, 40)
  const editingIndex =
    record.editingIndex === undefined
      ? undefined
      : integer(record.editingIndex, 'draft.editingIndex', 0, hands.length)
  const honbaAdjust =
    record.honbaAdjust === undefined
      ? undefined
      : integer(record.honbaAdjust, 'draft.honbaAdjust', -1_000, 1_000)
  return {
    mode,
    date: dateString(record.date, 'draft.date'),
    note: optionalText(record.note, 'draft.note'),
    playerIds,
    hands,
    ...(rules ? { rules } : {}),
    finalPoints,
    form,
    ...(quickPoints ? { quickPoints } : {}),
    ...(pointsEdit ? { pointsEdit } : {}),
    ...(editingIndex === undefined ? {} : { editingIndex }),
    ...(honbaAdjust === undefined ? {} : { honbaAdjust }),
  }
}

function playerIdsValue(value: unknown, path: string): string[] {
  return playerIds(value, path)
}

function parseStringMap(
  value: unknown,
  path: string,
  ids: string[],
  maxLength: number,
): Record<string, string> | undefined {
  if (value === undefined) return undefined
  const record = requiredRecord(value, path)
  const result: Record<string, string> = {}
  for (const id of ids) {
    if (record[id] !== undefined) {
      if (typeof record[id] !== 'string' || record[id].length > maxLength) {
        fail('入力文字列が不正です', `${path}.${id}`)
      }
      result[id] = record[id]
    }
  }
  for (const key of Object.keys(record)) {
    if (!ids.includes(key)) fail('存在しないプレイヤーIDがあります', `${path}.${key}`)
  }
  return result
}

function parseGames(value: unknown): Game[] {
  const values = boundedArray(value, 'games', MAX_GAMES)
  const games = values.map((item, index) => parseGame(item, `games[${index}]`))
  if (new Set(games.map((game) => game.id)).size !== games.length) {
    fail('ゲームIDが重複しています', 'games')
  }
  return games
}

function assertGamesReferencePlayers(games: Game[], players: Player[], path: string): void {
  const known = new Set(players.map((player) => player.id))
  games.forEach((game, index) => {
    game.playerIds.forEach((playerId, playerIndex) => {
      if (!known.has(playerId)) {
        fail(
          'ゲームに存在しないプレイヤーIDがあります',
          `${path}[${index}].playerIds[${playerIndex}]`,
        )
      }
    })
  })
}

export function parseGame(value: unknown, path = 'game'): Game {
  const record = requiredRecord(value, path)
  const id = requiredString(record.id, `${path}.id`, MAX_ID_LENGTH)
  const playerIds = playerIdsValue(record.playerIds, `${path}.playerIds`)
  const playerSet = new Set(playerIds)
  const handsValues = boundedArray(record.hands, `${path}.hands`, MAX_HANDS)
  const hands = handsValues.map((item, index) =>
    parseHand(item, `${path}.hands[${index}]`, playerSet),
  )
  const rules = record.rules === undefined ? undefined : parseRules(record.rules, false)
  return {
    id,
    date: dateString(record.date, `${path}.date`),
    note: optionalText(record.note, `${path}.note`),
    playerIds,
    hands,
    finalPoints: parseFinalPoints(record.finalPoints, playerIds, `${path}.finalPoints`),
    ...(rules ? { rules } : {}),
    createdAt:
      record.createdAt === undefined
        ? undefined
        : integer(record.createdAt, `${path}.createdAt`, 0, Number.MAX_SAFE_INTEGER),
  }
}

export function parseRoomState(value: unknown, allowLegacyDefaults = false): RoomState {
  const record = requiredRecord(value, 'state')
  const players = parsePlayers(record.players)
  const rules = parseRules(record.rules, allowLegacyDefaults)
  const playerSet = new Set(players.map((player) => player.id))
  const draft = record.draft === null ? null : parseDraft(record.draft, playerSet)
  if (draft && draft.playerIds.length !== MAX_PLAYERS)
    fail('Draftの人数が不正です', 'draft.playerIds')
  return { players, rules, draft }
}

export function parseDB(value: unknown): DB {
  const record = requiredRecord(value, 'db')
  const state = parseRoomState(
    {
      players: record.players,
      rules: record.rules,
      draft: record.draft === undefined ? null : record.draft,
    },
    true,
  )
  const games = parseGames(record.games)
  assertGamesReferencePlayers(games, state.players, 'games')
  return {
    version: 2,
    ...state,
    games,
  }
}

export function parseRoomSnapshot(value: unknown): RoomSnapshot {
  const record = requiredRecord(value, 'snapshot')
  const roomCode = requiredString(record.roomCode, 'snapshot.roomCode', 32)
  const revision = integer(record.revision, 'snapshot.revision', 0, Number.MAX_SAFE_INTEGER)
  const state = parseRoomState(record.state, true)
  const games = parseGames(record.games)
  assertGamesReferencePlayers(games, state.players, 'snapshot.games')
  return { roomCode, revision, state, games }
}
