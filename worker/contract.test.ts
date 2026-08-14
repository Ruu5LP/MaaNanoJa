import { describe, expect, it } from 'vitest'
import worker, { parseRevision, readJson, returnTo } from './index'

const players = [
  { id: 'p-1', name: '東' },
  { id: 'p-2', name: '南' },
  { id: 'p-3', name: '西' },
  { id: 'p-4', name: '北' },
]

const rules = {
  startPoints: 25_000,
  returnPoints: 30_000,
  uma: [30, 10, -10, -30],
  tiebreak: 'shimocha' as const,
}

function fakeEnv(
  options: {
    ownerUserId?: string | null
    sessionUserId?: string | null
  } = {},
): {
  env: Record<string, unknown>
  updates: () => number
  batches: () => string[][]
} {
  const room = {
    code: 'ABCD2345',
    owner_user_id: options.ownerUserId ?? null,
    players_json: JSON.stringify(players),
    rules_json: JSON.stringify(rules),
    draft_json: null,
    revision: 3,
    last_write_token: '',
    created_at: 0,
    updated_at: 0,
  }
  let updateCount = 0
  const batchQueries: string[][] = []
  const db = {
    prepare(sql: string) {
      const statement = {
        sql,
        bind(..._args: unknown[]) {
          return {
            sql,
            async first() {
              if (sql.includes('FROM auth_sessions')) {
                return options.sessionUserId
                  ? {
                      id: options.sessionUserId,
                      provider: 'google',
                      provider_subject: 'google:subject',
                      email: 'owner@example.com',
                      display_name: 'Owner',
                      created_at: 0,
                      updated_at: 0,
                    }
                  : null
              }
              if (sql.includes('FROM rooms')) return room
              if (sql.includes('SELECT 1 AS present FROM games')) return null
              return null
            },
            async all() {
              return { results: [] }
            },
            async run() {
              updateCount += 1
              return { meta: { changes: 1 } }
            },
          }
        },
      }
      return statement
    },
    async batch(statements: Array<{ sql: string }>) {
      batchQueries.push(statements.map((statement) => statement.sql))
      return statements.map(() => ({ meta: { changes: 1 } }))
    },
  }
  return {
    env: { DB: db, ASSETS: { fetch: async () => new Response('') } },
    updates: () => updateCount,
    batches: () => batchQueries,
  }
}

describe('Worker request boundaries', () => {
  it('keeps OAuth returnTo on the same origin', () => {
    expect(
      returnTo(new Request('https://app.example/auth/google?returnTo=%2F%3Froom%3DABCDEFGH')),
    ).toBe('/?room=ABCDEFGH')
    expect(
      returnTo(
        new Request('https://app.example/auth/google?returnTo=https%3A%2F%2Fevil.example%2F'),
      ),
    ).toBe('/')
    expect(
      returnTo(new Request('https://app.example/auth/google?returnTo=%2F%5Cevil.example')),
    ).toBe('/')
  })

  it('accepts only non-negative safe integer revisions', () => {
    expect(parseRevision(0)).toBe(0)
    expect(parseRevision(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER)
    expect(() => parseRevision(-1)).toThrow()
    expect(() => parseRevision(Number.MAX_SAFE_INTEGER + 1)).toThrow()
    expect(() => parseRevision('1')).toThrow()
  })

  it('enforces the actual request body size, not only Content-Length', async () => {
    const request = new Request('https://app.example/api/rooms', {
      method: 'POST',
      body: 'x'.repeat(1_900_001),
    })
    await expect(readJson(request)).rejects.toThrow('大きすぎます')
  })

  it('rejects malformed state at the Worker API boundary', async () => {
    const { env } = fakeEnv()
    const response = await worker.fetch(
      new Request('https://app.example/api/rooms/ABCD2345/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revision: 3,
          state: { players: [null], rules: { startPoints: 'bad' }, draft: null },
        }),
      }) as never,
      env as never,
    )
    expect(response.status).toBe(400)
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Content-Security-Policy')).toContain("default-src 'self'")
    expect(response.headers.get('X-Request-ID')).toMatch(/^[-\w]+$/)
  })

  it('does not increment revision when updating a missing game', async () => {
    const fake = fakeEnv()
    const response = await worker.fetch(
      new Request('https://app.example/api/rooms/ABCD2345/games/g-missing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revision: 3,
          game: {
            id: 'g-missing',
            date: '2026-08-12',
            note: '',
            playerIds: players.map((player) => player.id),
            hands: [],
            finalPoints: Object.fromEntries(players.map((player) => [player.id, 25_000])),
          },
        }),
      }) as never,
      fake.env as never,
    )
    expect(response.status).toBe(404)
    expect(fake.updates()).toBe(0)
  })

  it('returns 429 when the configured write limiter rejects a request', async () => {
    const fake = fakeEnv()
    fake.env.ROOM_WRITE_RATE_LIMITER = {
      limit: async () => ({ success: false }),
    }
    const response = await worker.fetch(
      new Request('https://app.example/api/rooms', { method: 'POST' }) as never,
      fake.env as never,
    )
    expect(response.status).toBe(429)
    expect(fake.updates()).toBe(0)
  })

  it('requires Google authentication before creating a room when auth is enabled', async () => {
    const fake = fakeEnv()
    fake.env.GOOGLE_CLIENT_ID = 'client-id'
    fake.env.GOOGLE_CLIENT_SECRET = 'client-secret'

    const response = await worker.fetch(
      new Request('https://app.example/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }) as never,
      fake.env as never,
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Googleでログインしてください' })
    expect(fake.updates()).toBe(0)
  })

  it('deletes a room and its related data only for the owner', async () => {
    const fake = fakeEnv({ ownerUserId: 'usr-owner', sessionUserId: 'usr-owner' })
    fake.env.GOOGLE_CLIENT_ID = 'client-id'
    fake.env.GOOGLE_CLIENT_SECRET = 'client-secret'

    const response = await worker.fetch(
      new Request('https://app.example/api/rooms/ABCD2345', {
        method: 'DELETE',
        headers: { Cookie: 'maananaja_session=test-session' },
      }) as never,
      fake.env as never,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ roomCode: 'ABCD2345' })
    expect(fake.batches()).toEqual([
      [
        'DELETE FROM games WHERE room_code = ?',
        'DELETE FROM room_members WHERE room_code = ?',
        'DELETE FROM rooms WHERE code = ? AND owner_user_id = ?',
      ],
    ])
  })

  it('hides a room from non-owners and unauthenticated users during deletion', async () => {
    const nonOwner = fakeEnv({ ownerUserId: 'usr-owner', sessionUserId: 'usr-member' })
    nonOwner.env.GOOGLE_CLIENT_ID = 'client-id'
    nonOwner.env.GOOGLE_CLIENT_SECRET = 'client-secret'
    const nonOwnerResponse = await worker.fetch(
      new Request('https://app.example/api/rooms/ABCD2345', {
        method: 'DELETE',
        headers: { Cookie: 'maananaja_session=test-session' },
      }) as never,
      nonOwner.env as never,
    )
    expect(nonOwnerResponse.status).toBe(404)
    expect(nonOwner.batches()).toHaveLength(0)

    const unauthenticated = fakeEnv({ ownerUserId: 'usr-owner' })
    unauthenticated.env.GOOGLE_CLIENT_ID = 'client-id'
    unauthenticated.env.GOOGLE_CLIENT_SECRET = 'client-secret'
    const unauthenticatedResponse = await worker.fetch(
      new Request('https://app.example/api/rooms/ABCD2345', { method: 'DELETE' }) as never,
      unauthenticated.env as never,
    )
    expect(unauthenticatedResponse.status).toBe(401)
    expect(unauthenticated.batches()).toHaveLength(0)
  })
})
