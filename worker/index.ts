import { isRoomCode } from '../src/lib/cloud-room'

const MAX_JSON_BYTES = 1_900_000
const SESSION_COOKIE = 'maananaja_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000

type AuthEnv = Env & {
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
}

interface RoomRow {
  code: string
  owner_user_id: string | null
  players_json: string
  rules_json: string
  draft_json: string | null
  revision: number
  last_write_token: string
  created_at: number
  updated_at: number
}

interface UserRow {
  id: string
  provider: string
  provider_subject: string
  email: string
  display_name: string
  created_at: number
  updated_at: number
}

interface AuthContext {
  enabled: boolean
  user: UserRow | null
}

interface OAuthStateRow {
  state_hash: string
  code_verifier: string
  return_to: string
  expires_at: number
  created_at: number
}

interface GoogleUserInfo {
  sub?: unknown
  email?: unknown
  email_verified?: unknown
  name?: unknown
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

interface ParsedGame {
  id: string
  date: string
  json: string
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

function parseGame(value: unknown): ParsedGame {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id) {
    throw new RequestError('game.id が不正です', 400)
  }
  if (typeof value.date !== 'string') throw new RequestError('game.date が不正です', 400)
  return { id: value.id, date: value.date, json: jsonText(value, 'game') }
}

function parseCreationGames(value: unknown): ParsedGame[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new RequestError('games が不正です', 400)
  const ids = new Set<string>()
  return value.map((game) => {
    const parsed = parseGame(game)
    if (ids.has(parsed.id)) throw new RequestError('games に同じIDが重複しています', 400)
    ids.add(parsed.id)
    return parsed
  })
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

function googleConfig(env: AuthEnv): { clientId: string; clientSecret: string } | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim()
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return base64Url(bytes)
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return base64Url(new Uint8Array(digest))
}

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get('Cookie')
  if (!cookie) return null
  for (const part of cookie.split(';')) {
    const [key, ...value] = part.trim().split('=')
    if (key === name) return value.join('=') || null
  }
  return null
}

function cookieHeader(value: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`
}

function redirectResponse(location: string, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers)
  responseHeaders.set('Location', location)
  return new Response(null, { status: 302, headers: responseHeaders })
}

function authError(message: string, status = 503): Response {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

function redirectUri(request: Request): string {
  return new URL('/auth/google/callback', request.url).toString()
}

function returnTo(request: Request): string {
  const requested = new URL(request.url).searchParams.get('returnTo')
  if (!requested || !requested.startsWith('/') || requested.startsWith('//')) return '/'
  return requested
}

async function upsertUser(
  env: Env,
  provider: string,
  providerSubject: string,
  email: string,
  displayName: string,
): Promise<UserRow> {
  const now = Date.now()
  const existing = await env.DB.prepare(
    `SELECT id, provider, provider_subject, email, display_name, created_at, updated_at
     FROM users WHERE provider_subject = ?`,
  )
    .bind(providerSubject)
    .first<UserRow>()

  if (existing) {
    const nextEmail = email || existing.email
    const nextDisplayName = displayName || nextEmail
    if (existing.email !== nextEmail || existing.display_name !== nextDisplayName) {
      await env.DB.prepare(
        'UPDATE users SET email = ?, display_name = ?, updated_at = ? WHERE id = ?',
      )
        .bind(nextEmail, nextDisplayName, now, existing.id)
        .run()
      return {
        ...existing,
        email: nextEmail,
        display_name: nextDisplayName,
        updated_at: now,
      }
    }
    return existing
  }

  const candidate: UserRow = {
    id: `usr-${crypto.randomUUID()}`,
    provider,
    provider_subject: providerSubject,
    email: email || `${providerSubject}@invalid.local`,
    display_name: displayName || email || providerSubject,
    created_at: now,
    updated_at: now,
  }
  await env.DB.prepare(
    `INSERT OR IGNORE INTO users
     (id, provider, provider_subject, email, display_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      candidate.id,
      candidate.provider,
      candidate.provider_subject,
      candidate.email,
      candidate.display_name,
      candidate.created_at,
      candidate.updated_at,
    )
    .run()
  const saved = await env.DB.prepare(
    `SELECT id, provider, provider_subject, email, display_name, created_at, updated_at
     FROM users WHERE provider_subject = ?`,
  )
    .bind(providerSubject)
    .first<UserRow>()
  if (!saved) throw new RequestError('アカウントを保存できませんでした', 500)
  return saved
}

async function getAuthContext(request: Request, env: AuthEnv): Promise<AuthContext> {
  const enabled = googleConfig(env) !== null
  if (!enabled) return { enabled: false, user: null }

  const token = cookieValue(request, SESSION_COOKIE)
  if (!token) return { enabled: true, user: null }
  const sessionHash = await sha256(token)
  const now = Date.now()
  const session = await env.DB.prepare(
    `SELECT u.id, u.provider, u.provider_subject, u.email, u.display_name,
            u.created_at, u.updated_at
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.session_hash = ? AND s.expires_at > ?`,
  )
    .bind(sessionHash, now)
    .first<UserRow>()
  if (!session) {
    await env.DB.prepare('DELETE FROM auth_sessions WHERE session_hash = ?').bind(sessionHash).run()
    return { enabled: true, user: null }
  }
  return { enabled: true, user: session }
}

async function startGoogleLogin(request: Request, env: AuthEnv): Promise<Response> {
  const config = googleConfig(env)
  if (!config) return authError('Googleログインがまだ設定されていません')

  const state = randomToken()
  const codeVerifier = randomToken()
  const now = Date.now()
  await env.DB.prepare('DELETE FROM oauth_states WHERE expires_at <= ?').bind(now).run()
  await env.DB.prepare(
    `INSERT INTO oauth_states (state_hash, code_verifier, return_to, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(await sha256(state), codeVerifier, returnTo(request), now + OAUTH_STATE_TTL_MS, now)
    .run()

  const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authorization.searchParams.set('client_id', config.clientId)
  authorization.searchParams.set('redirect_uri', redirectUri(request))
  authorization.searchParams.set('response_type', 'code')
  authorization.searchParams.set('scope', 'openid profile email')
  authorization.searchParams.set('state', state)
  authorization.searchParams.set('code_challenge', await sha256(codeVerifier))
  authorization.searchParams.set('code_challenge_method', 'S256')
  authorization.searchParams.set('access_type', 'online')
  authorization.searchParams.set('prompt', 'select_account')
  return Response.redirect(authorization.toString(), 302)
}

async function googleCallback(request: Request, env: AuthEnv): Promise<Response> {
  const config = googleConfig(env)
  if (!config) return authError('Googleログインがまだ設定されていません')
  const url = new URL(request.url)
  const oauthError = url.searchParams.get('error')
  if (oauthError) return authError(`Googleログインがキャンセルされました (${oauthError})`, 400)

  const state = url.searchParams.get('state')
  const code = url.searchParams.get('code')
  if (!state || !code) return authError('Googleログインの応答が不正です', 400)

  const stateHash = await sha256(state)
  const stateRow = await env.DB.prepare(
    `SELECT state_hash, code_verifier, return_to, expires_at, created_at
     FROM oauth_states WHERE state_hash = ? AND expires_at > ?`,
  )
    .bind(stateHash, Date.now())
    .first<OAuthStateRow>()
  await env.DB.prepare('DELETE FROM oauth_states WHERE state_hash = ?').bind(stateHash).run()
  if (!stateRow)
    return authError('Googleログインの有効期限が切れています。もう一度お試しください', 400)

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri(request),
      grant_type: 'authorization_code',
      code_verifier: stateRow.code_verifier,
    }),
  })
  if (!tokenResponse.ok) return authError('Googleのトークン交換に失敗しました', 502)
  const tokenPayload = (await tokenResponse.json()) as Record<string, unknown>
  const accessToken = typeof tokenPayload.access_token === 'string' ? tokenPayload.access_token : ''
  if (!accessToken) return authError('Googleのアクセストークンを取得できませんでした', 502)

  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!profileResponse.ok) return authError('Googleのユーザー情報を取得できませんでした', 502)
  const profile = (await profileResponse.json()) as GoogleUserInfo
  const subject = typeof profile.sub === 'string' ? profile.sub : ''
  const email = typeof profile.email === 'string' ? profile.email.trim().toLowerCase() : ''
  const verified = profile.email_verified === true
  const displayName = typeof profile.name === 'string' ? profile.name.trim() : ''
  if (!subject || !email || !verified) {
    return authError('Googleのメールアドレスを確認できませんでした', 403)
  }

  const user = await upsertUser(env, 'google', `google:${subject}`, email, displayName)
  const sessionToken = randomToken()
  await env.DB.prepare(
    `INSERT INTO auth_sessions (session_hash, user_id, expires_at, created_at)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(await sha256(sessionToken), user.id, Date.now() + SESSION_TTL_MS, Date.now())
    .run()

  const destination = new URL(stateRow.return_to, new URL(request.url).origin).toString()
  return redirectResponse(destination, {
    'Set-Cookie': cookieHeader(sessionToken, SESSION_TTL_MS / 1000),
  })
}

async function logout(request: Request, env: AuthEnv): Promise<Response> {
  const token = cookieValue(request, SESSION_COOKIE)
  if (token) {
    await env.DB.prepare('DELETE FROM auth_sessions WHERE session_hash = ?')
      .bind(await sha256(token))
      .run()
  }
  return redirectResponse('/', { 'Set-Cookie': cookieHeader('', 0) })
}

function requireUser(auth: AuthContext): UserRow {
  if (!auth.user) throw new RequestError('Googleでログインしてください', 401)
  return auth.user
}

function accountUser(user: UserRow | null): unknown {
  if (!user) return null
  return { id: user.id, email: user.email, displayName: user.display_name }
}

async function ensureRoomMember(env: Env, room: RoomRow, user: UserRow): Promise<void> {
  const role = room.owner_user_id === user.id ? 'owner' : 'member'
  await env.DB.prepare(
    `INSERT OR IGNORE INTO room_members (room_code, user_id, role, created_at)
     VALUES (?, ?, ?, ?)`,
  )
    .bind(room.code, user.id, role, Date.now())
    .run()
}

async function getAuthorizedRoom(
  env: Env,
  code: string,
  auth: AuthContext,
): Promise<RoomRow | null> {
  const room = await getRoom(env, code)
  if (room && auth.enabled) await ensureRoomMember(env, room, requireUser(auth))
  return room
}

async function getRoom(env: Env, code: string): Promise<RoomRow | null> {
  return env.DB.prepare(
    `SELECT code, owner_user_id, players_json, rules_json, draft_json, revision, last_write_token, created_at, updated_at
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

async function createRoom(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  const owner = auth.enabled ? requireUser(auth) : null
  const body = await readJson(request)
  const input = isRecord(body) && 'state' in body ? body.state : null
  const state = input === null ? { players: [], rules: {}, draft: null } : parseRoomState(input)
  const games = parseCreationGames(isRecord(body) ? body.games : undefined)
  const now = Date.now()

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateRoomCode()
    const results = await env.DB.batch([
      env.DB.prepare(
        `INSERT OR IGNORE INTO rooms
         (code, owner_user_id, players_json, rules_json, draft_json, revision, last_write_token, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, '', ?, ?)`,
      ).bind(
        code,
        owner?.id ?? null,
        jsonText(state.players, 'players'),
        jsonText(state.rules, 'rules'),
        state.draft === null ? null : jsonText(state.draft, 'draft'),
        now,
        now,
      ),
      ...(owner
        ? [
            env.DB.prepare(
              `INSERT OR IGNORE INTO room_members (room_code, user_id, role, created_at)
               SELECT ?, ?, 'owner', ?
               WHERE EXISTS (SELECT 1 FROM rooms WHERE code = ?)`,
            ).bind(code, owner.id, now, code),
          ]
        : []),
      ...games.map((game) =>
        env.DB.prepare(
          `INSERT OR IGNORE INTO games (id, room_code, date, game_json, created_at)
           SELECT ?, ?, ?, ?, ?
           WHERE EXISTS (SELECT 1 FROM rooms WHERE code = ?)`,
        ).bind(game.id, code, game.date, game.json, now, code),
      ),
    ])
    if ((results[0]?.meta.changes ?? 0) === 1) {
      const gameResultOffset = owner ? 2 : 1
      const migratedGames = results
        .slice(gameResultOffset)
        .reduce((count, result) => count + Number(result.meta.changes ?? 0), 0)
      return json({ roomCode: code, revision: 0, migratedGames })
    }
  }

  return errorResponse(503, 'ルームコードを発行できませんでした')
}

async function updateState(
  request: Request,
  env: Env,
  code: string,
  auth: AuthContext,
): Promise<Response> {
  const room = await getAuthorizedRoom(env, code, auth)
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

async function addGame(
  request: Request,
  env: Env,
  code: string,
  auth: AuthContext,
): Promise<Response> {
  const room = await getAuthorizedRoom(env, code, auth)
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
  auth: AuthContext,
): Promise<Response> {
  const room = await getAuthorizedRoom(env, code, auth)
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
  auth: AuthContext,
): Promise<Response> {
  const room = await getAuthorizedRoom(env, code, auth)
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

async function getMe(auth: AuthContext): Promise<Response> {
  return json({
    loginEnabled: auth.enabled,
    authenticated: Boolean(auth.user),
    user: accountUser(auth.user),
  })
}

async function getMyRooms(env: Env, auth: AuthContext): Promise<Response> {
  const user = requireUser(auth)
  const result = await env.DB.prepare(
    `SELECT r.code AS room_code, rm.role, r.created_at, r.updated_at,
            COUNT(g.id) AS game_count
     FROM room_members rm
     JOIN rooms r ON r.code = rm.room_code
     LEFT JOIN games g ON g.room_code = r.code
     WHERE rm.user_id = ?
     GROUP BY r.code, rm.role, r.created_at, r.updated_at
     ORDER BY r.updated_at DESC, r.code ASC`,
  )
    .bind(user.id)
    .all<{
      room_code: string
      role: 'owner' | 'member'
      created_at: number
      updated_at: number
      game_count: number
    }>()

  return json({
    rooms: result.results.map((room) => ({
      roomCode: room.room_code,
      role: room.role,
      createdAt: room.created_at,
      updatedAt: room.updated_at,
      gameCount: Number(room.game_count),
    })),
  })
}

async function joinRoom(
  request: Request,
  env: Env,
  code: string,
  auth: AuthContext,
): Promise<Response> {
  if (request.body) {
    // The endpoint is intentionally bodyless; consume no input but reject malformed JSON callers.
    const contentType = request.headers.get('Content-Type') ?? ''
    if (contentType.includes('application/json')) await readJson(request)
  }
  const room = await getRoom(env, code)
  if (!room) return errorResponse(404, 'ルームが見つかりません')
  const user = requireUser(auth)
  await ensureRoomMember(env, room, user)
  return json({ roomCode: code })
}

async function handleApi(request: Request, env: AuthEnv): Promise<Response> {
  const auth = await getAuthContext(request, env)
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
    return createRoom(request, env, auth)
  }

  if (parts.length === 2 && parts[0] === 'api' && parts[1] === 'me' && request.method === 'GET') {
    return getMe(auth)
  }
  if (
    parts.length === 3 &&
    parts[0] === 'api' &&
    parts[1] === 'my' &&
    parts[2] === 'rooms' &&
    request.method === 'GET'
  ) {
    return getMyRooms(env, auth)
  }

  if (parts.length < 3 || parts[0] !== 'api' || parts[1] !== 'rooms') {
    return errorResponse(404, 'APIが見つかりません')
  }
  const code = parts[2]
  if (!isRoomCode(code)) return errorResponse(400, 'ルームコードが不正です')

  if (parts.length === 3 && request.method === 'GET') {
    const room = await getAuthorizedRoom(env, code, auth)
    return room ? json(await roomSnapshot(env, room)) : errorResponse(404, 'ルームが見つかりません')
  }
  if (parts.length === 4 && parts[3] === 'join' && request.method === 'POST') {
    return joinRoom(request, env, code, auth)
  }
  if (parts.length === 4 && parts[3] === 'state' && request.method === 'PUT') {
    return updateState(request, env, code, auth)
  }
  if (parts.length === 4 && parts[3] === 'games' && request.method === 'POST') {
    return addGame(request, env, code, auth)
  }
  if (parts.length === 5 && parts[3] === 'games' && request.method === 'DELETE') {
    return deleteGame(request, env, code, parts[4], auth)
  }
  if (parts.length === 5 && parts[3] === 'games' && request.method === 'PUT') {
    return updateGame(request, env, code, parts[4], auth)
  }
  return errorResponse(405, 'method not allowed')
}

export default {
  async fetch(request, env: AuthEnv): Promise<Response> {
    try {
      const url = new URL(request.url)
      if (url.pathname === '/auth/google') return await startGoogleLogin(request, env)
      if (url.pathname === '/auth/google/callback') return await googleCallback(request, env)
      if (url.pathname === '/auth/logout') return await logout(request, env)
      if (url.pathname.startsWith('/api/')) return await handleApi(request, env)
      return env.ASSETS.fetch(request)
    } catch (error) {
      if (error instanceof RequestError) return errorResponse(error.status, error.message)
      console.error(JSON.stringify({ event: 'worker_error', message: String(error) }))
      return errorResponse(500, 'サーバー内部でエラーが発生しました')
    }
  },
} satisfies ExportedHandler<AuthEnv>
