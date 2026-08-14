import { useMemo, type MouseEvent } from 'react'
import { GOOGLE_LOGIN_PATH, LOGOUT_PATH, type AccountState } from '../lib/account'

interface AppHeaderProps {
  account: AccountState | null
  accountError?: string | null
  guestMode?: boolean
  roomCode?: string | null
  syncStatus?: string | null
  syncLabel?: string
  onHome(): void
  onRetryAccount?(): void
}

export default function AppHeader({
  account,
  accountError = null,
  guestMode = false,
  roomCode = null,
  syncStatus = null,
  syncLabel = '',
  onHome,
  onRetryAccount,
}: AppHeaderProps) {
  const loginUrl = useMemo(() => {
    const current = `${window.location.pathname}${window.location.search}`
    return `${GOOGLE_LOGIN_PATH}?returnTo=${encodeURIComponent(current)}`
  }, [])

  function handleBrandClick(event: MouseEvent<HTMLAnchorElement>) {
    // 新しいタブで開く操作は通常のリンクとして扱う。
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }
    event.preventDefault()
    onHome()
  }

  return (
    <header className="app-header">
      <a className="app-brand" href="/" onClick={handleBrandClick}>
        <span className="app-brand-mark" aria-hidden="true">
          🀄
        </span>
        <span>麻雀トラッカー</span>
      </a>

      <div className="app-header-meta">
        <div className="app-header-context" aria-live="polite">
          {guestMode && <span className="sync-badge sync-guest">📝 ゲストモード</span>}
          {roomCode && (
            <span className={`sync-badge sync-${syncStatus ?? 'idle'}`} role="status">
              {syncLabel}
            </span>
          )}
        </div>

        <div className="app-account" aria-label="アカウント">
          {account?.user ? (
            <>
              <span className="header-account-user" title={account.user.email}>
                <span aria-hidden="true">👤</span> {account.user.displayName}
              </span>
              <a className="btn sm ghost header-auth-action" href={LOGOUT_PATH}>
                ログアウト
              </a>
            </>
          ) : accountError && !account ? (
            <button className="btn sm ghost header-auth-action" onClick={onRetryAccount}>
              ログイン状態を再確認
            </button>
          ) : account ? (
            <a className="btn sm primary header-auth-action" href={loginUrl}>
              <span className="header-auth-label-wide">Googleでログイン</span>
              <span className="header-auth-label-compact">ログイン</span>
            </a>
          ) : (
            <span className="header-account-status">ログイン状態を確認中…</span>
          )}
        </div>
      </div>
    </header>
  )
}
