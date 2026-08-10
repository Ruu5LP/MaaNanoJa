export const GOOGLE_LOGIN_PATH = '/auth/google'
export const LOGOUT_PATH = '/auth/logout'

export interface AccountUser {
  id: string
  email: string
  displayName: string
}

export interface AccountRoom {
  roomCode: string
  role: 'owner' | 'member'
  createdAt: number
  updatedAt: number
  gameCount: number
}

export interface AccountState {
  loginEnabled: boolean
  authenticated: boolean
  user: AccountUser | null
}

export function isAccountUser(value: unknown): value is AccountUser {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.email === 'string' &&
    typeof record.displayName === 'string'
  )
}

export function isAccountState(value: unknown): value is AccountState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.loginEnabled === 'boolean' &&
    typeof record.authenticated === 'boolean' &&
    (record.user === null || isAccountUser(record.user))
  )
}

export function isAccountRoom(value: unknown): value is AccountRoom {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.roomCode === 'string' &&
    (record.role === 'owner' || record.role === 'member') &&
    typeof record.createdAt === 'number' &&
    typeof record.updatedAt === 'number' &&
    typeof record.gameCount === 'number'
  )
}
