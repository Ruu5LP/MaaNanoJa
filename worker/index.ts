import { isRoomCode } from '../src/lib/cloud-room'

const MAX_JSON_BYTES = 1_900_000

interface RoomRow {
  code: string
  players_json: string
  rules_json: string
  draft_json: string | null
  revision: number
  last_write_token: string
  created_at: number
  updated_at: number
}

interface GameRow {
  id: string
  room_code: string
  date: string
  game_json: string
  created_at: number
}

interface RoomStateInput {
  players: unknown
  rules: unknown
  draft: unknown
}

interface RoomSnapshotResponse {
  roomCode: string
  revision: number
  state: RoomStateInput
  games: unknown[]
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}

function errorResponse(status: number, error: string): Response {
  return json({ error }, status)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function jsonText(value: unknown, field: string): string {
  const text = JSON.stringify(value)
  if (text === undefined || new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) {
    throw new RequestError(`${field} が大きすぎます`, 413)
  }
  return text
}

function parseStoredJson(text: string, field: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new RequestError(`${field} の保存データが壊れています`, 500)
  }
}

function parseRevision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new RequestError('revision が不正です', 400)
  }
  return value
}

function parseRoomState(value: unknown): RoomStateInput {
  if (!isRecord(value)) throw new RequestError('state が不正です', 400)
  if (!Array.isArray(value.players)) throw new RequestError('players が不正です', 400)
  if (!isRecord(value.rules)) throw new RequestError('rules が不正です', 400)
  if (value.draft !== null && !isRecord(value.draft)) {
    throw new RequestError('draft が不正です', 400)
  }
  return { players: value.players, rules: value.rules, draft: value.draft }
}

function parseGame(value: unknown): { id: string; date: string; json: string } {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id) {
    throw new RequestError('game.id が不正です', 400)
  }
  if (typeof value.date !== 'string') throw new RequestError('game.date が不正です', 400)
  return { id: value.id, date: value.date, json: jsonText(value, 'game') }
}

async function readJson(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get('Content-Length') ?? 0)
  if (contentLength > MAX_JSON_BYTES) throw new RequestError('リクエストが大きすぎます', 413)
  try {
    return await request.json()
  } catch {
    throw new RequestError('JSONを読み取れません', 400)
  }
}

function generateRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function getRoom(env: Env, code: string): Promise<RoomRow | null> {
  return env.DB.prepare(
    `SELECT code, players_json, rules_json, draft_json, revision, last_write_token, created_at, updated_at
     FROM rooms WHERE code = ?`,
  )
    .bind(code)
    .first<RoomRow>()
}

async function roomSnapshot(env: Env, room: RoomRow): Promise<RoomSnapshotResponse> {
  const games = await env.DB.prepare(
    `SELECT id, room_code, date, game_json, created_at
     FROM games WHERE room_code = ? ORDER BY date ASC, created_at ASC, id ASC`,
  )
    .bind(room.code)
    .all<GameRow>()

  return {
    roomCode: room.code,
    revision: room.revision,
    state: {
      players: parseStoredJson(room.players_json, 'players'),
      rules: parseStoredJson(room.rules_json, 'rules'),
      draft: room.draft_json === null ? null : parseStoredJson(room.draft_json, 'draft'),
    },
    games: games.results.map((game) => parseStoredJson(game.game_json, 'game')),
  }
}

async function conflict(env: Env, room: RoomRow): Promise<Response> {
  return json({ error: 'revision_conflict', snapshot: await roomSnapshot(env, room) }, 409)
}

async function createRoom(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request)
  const input = isRecord(body) && 'state' in body ? body.state : null
  const state = input === null ? { players: [], rules: {}, draft: null } : parseRoomState(input)
  const now = Date.now()

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateRoomCode()
    const result = await env.DB.prepare(
      `INSERT OR IGNORE INTO rooms
       (code, players_json, rules_json, draft_json, revision, last_write_token, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, '', ?, ?)`,
    )
      .bind(
        code,
        jsonText(state.players, 'players'),
        jsonText(state.rules, 'rules'),
        state.draft === null ? null : jsonText(state.draft, 'draft'),
        now,
        now,
      )
      .run()
    if ((result.meta.changes ?? 0) === 1) return json({ roomCode: code, revision: 0 })
  }

  return errorResponse(503, 'ルームコードを発行できませんでした')
}

async function updateState(request: Request, env: Env, code: string): Promise<Response> {
  const room = await getRoom(env, code)
  if (!room) return errorResponse(404, 'ルームが見つかりません')
  const body = await readJson(request)
  if (!isRecord(body)) throw new RequestError('リクエストが不正です', 400)
  const revision = parseRevision(body.revision)
  const state = parseRoomState(body.state)
  if (revision !== room.revision) return conflict(env, room)

  const nextRevision = revision + 1
  const result = await env.DB.prepare(
    `UPDATE rooms SET players_json = ?, rules_json = ?, draft_json = ?, revision = ?,
       last_write_token = '', updated_at = ?
     WHERE code = ? AND revision = ?`,
  )
    .bind(
      jsonText(state.players, 'players'),
      jsonText(state.rules, 'rules'),
      state.draft === null ? null : jsonText(state.draft, 'draft'),
      nextRevision,
      Date.now(),
      code,
      revision,
    )
    .run()
  if ((result.meta.changes ?? 0) !== 1) {
    const latest = await getRoom(env, code)
    return latest ? conflict(env, latest) : errorResponse(404, 'ルームが見つかりません')
  }
  return json({ revision: nextRevision })
}

async function addGame(request: Request, env: Env, code: string): Promise<Response> {
  const room = await getRoom(env, code)
  if (!room) return errorResponse(404, 'ルームが見つかりません')
  const body = await readJson(request)
  if (!isRecord(body)) throw new RequestError('リクエストが不正です', 400)
  const revision = parseRevision(body.revision)
  const game = parseGame(body.game)
  if (revision !== room.revision) return conflict(env, room)

  const duplicate = await env.DB.prepare(
    'SELECT 1 AS present FROM games WHERE room_code = ? AND id = ?',
  )
    .bind(code, game.id)
    .first<{ present: number }>()
  if (duplicate) return errorResponse(409, '同じゲームIDがすでに存在します')

  const token = crypto.randomUUID()
  const nextRevision = revision + 1
  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE rooms SET draft_json = NULL, revision = ?, last_write_token = ?, updated_at = ?
       WHERE code = ? AND revision = ?`,
    ).bind(nextRevision, token, Date.now(), code, revision),
    env.DB.prepare(
      `INSERT INTO games (id, room_code, date, game_json, created_at)
       SELECT ?, ?, ?, ?, ?
       WHERE EXISTS (
         SELECT 1 FROM rooms WHERE code = ? AND revision = ? AND last_write_token = ?
       )`,
    ).bind(game.id, code, game.date, game.json, Date.now(), code, nextRevision, token),
  ])
  const updated = Number(results[0]?.meta.changes ?? 0)
  const inserted = Number(results[1]?.meta.changes ?? 0)
  if (updated !== 1 || inserted !== 1) {
    const latest = await getRoom(env, code)
    return latest ? conflict(env, latest) : errorResponse(404, 'ルームが見つかりません')
  }
  return json({ revision: nextRevision })
}

async function deleteGame(
  request: Request,
  env: Env,
  code: string,
  gameId: string,
): Promise<Response> {
  const room = await getRoom(env, code)
  if (!room) return errorResponse(404, 'ルームが見つかりません')
  const body = await readJson(request)
  if (!isRecord(body)) throw new RequestError('リクエストが不正です', 400)
  const revision = parseRevision(body.revision)
  if (revision !== room.revision) return conflict(env, room)

  const game = await env.DB.prepare('SELECT 1 AS present FROM games WHERE room_code = ? AND id = ?')
    .bind(code, gameId)
    .first<{ present: number }>()
  if (!game) return errorResponse(404, 'ゲームが見つかりません')

  const token = crypto.randomUUID()
  const nextRevision = revision + 1
  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE rooms SET revision = ?, last_write_token = ?, updated_at = ?
       WHERE code = ? AND revision = ?`,
    ).bind(nextRevision, token, Date.now(), code, revision),
    env.DB.prepare(
      `DELETE FROM games WHERE room_code = ? AND id = ?
       AND EXISTS (
         SELECT 1 FROM rooms WHERE code = ? AND revision = ? AND last_write_token = ?
       )`,
    ).bind(code, gameId, code, nextRevision, token),
  ])
  const updated = Number(results[0]?.meta.changes ?? 0)
  const deleted = Number(results[1]?.meta.changes ?? 0)
  if (updated !== 1 || deleted !== 1) {
    const latest = await getRoom(env, code)
    return latest ? conflict(env, latest) : errorResponse(404, 'ルームが見つかりません')
  }
  return json({ revision: nextRevision })
}

async function updateGame(
  request: Request,
  env: Env,
  code: string,
  gameId: string,
): Promise<Response> {
  const room = await getRoom(env, code)
  if (!room) return errorResponse(404, 'ルームが見つかりません')
  const body = await readJson(request)
  if (!isRecord(body)) throw new RequestError('リクエストが不正です', 400)
  const revision = parseRevision(body.revision)
  const game = parseGame(body.game)
  if (game.id !== gameId) throw new RequestError('ゲームIDが一致しません', 400)
  if (revision !== room.revision) return conflict(env, room)

  const token = crypto.randomUUID()
  const nextRevision = revision + 1
  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE rooms SET revision = ?, last_write_token = ?, updated_at = ?
       WHERE code = ? AND revision = ?`,
    ).bind(nextRevision, token, Date.now(), code, revision),
    env.DB.prepare(
      `UPDATE games SET date = ?, game_json = ?
       WHERE room_code = ? AND id = ?
       AND EXISTS (
         SELECT 1 FROM rooms WHERE code = ? AND revision = ? AND last_write_token = ?
       )`,
    ).bind(game.date, game.json, code, gameId, code, nextRevision, token),
  ])
  const updated = Number(results[0]?.meta.changes ?? 0)
  const saved = Number(results[1]?.meta.changes ?? 0)
  if (updated !== 1 || saved !== 1) {
    const latest = await getRoom(env, code)
    return latest ? conflict(env, latest) : errorResponse(404, 'ルームが見つかりません')
  }
  return json({ revision: nextRevision })
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const parts = url.pathname
    .split('/')
    .filter(Boolean)
    .map((part) => decodeURIComponent(part))

  if (
    parts.length === 2 &&
    parts[0] === 'api' &&
    parts[1] === 'rooms' &&
    request.method === 'POST'
  ) {
    return createRoom(request, env)
  }

  if (parts.length < 3 || parts[0] !== 'api' || parts[1] !== 'rooms') {
    return errorResponse(404, 'APIが見つかりません')
  }
  const code = parts[2]
  if (!isRoomCode(code)) return errorResponse(400, 'ルームコードが不正です')

  if (parts.length === 3 && request.method === 'GET') {
    const room = await getRoom(env, code)
    return room ? json(await roomSnapshot(env, room)) : errorResponse(404, 'ルームが見つかりません')
  }
  if (parts.length === 4 && parts[3] === 'state' && request.method === 'PUT') {
    return updateState(request, env, code)
  }
  if (parts.length === 4 && parts[3] === 'games' && request.method === 'POST') {
    return addGame(request, env, code)
  }
  if (parts.length === 5 && parts[3] === 'games' && request.method === 'DELETE') {
    return deleteGame(request, env, code, parts[4])
  }
  if (parts.length === 5 && parts[3] === 'games' && request.method === 'PUT') {
    return updateGame(request, env, code, parts[4])
  }
  return errorResponse(405, 'method not allowed')
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      const url = new URL(request.url)
      if (url.pathname.startsWith('/api/')) return await handleApi(request, env)
      return env.ASSETS.fetch(request)
    } catch (error) {
      if (error instanceof RequestError) return errorResponse(error.status, error.message)
      console.error(JSON.stringify({ event: 'worker_error', message: String(error) }))
      return errorResponse(500, 'サーバー内部でエラーが発生しました')
    }
  },
} satisfies ExportedHandler<Env>
