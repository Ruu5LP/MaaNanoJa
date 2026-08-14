export type RoomAccessStatus = 'checking' | 'login-required' | 'confirm' | 'joining' | 'error'

interface RoomAccessViewProps {
  roomCode: string
  status: RoomAccessStatus
  ownerDisplayName?: string
  loginUrl: string
  error?: string | null
  onJoin(): void
  onBack(): void
  onRetry?(): void
}

export default function RoomAccessView({
  roomCode,
  status,
  ownerDisplayName,
  loginUrl,
  error = null,
  onJoin,
  onBack,
  onRetry,
}: RoomAccessViewProps) {
  const isConfirm = status === 'confirm' || status === 'joining'

  return (
    <main className="view room-access-view">
      <div className="card room-access-card">
        <span className="entry-kicker">共有ルーム</span>
        <p className="room-access-code">
          招待コード <code>{roomCode}</code>
        </p>

        {status === 'checking' && (
          <>
            <h2>ルームを確認しています…</h2>
            <p className="muted">参加状態を確認しています。少しお待ちください。</p>
          </>
        )}

        {status === 'login-required' && (
          <>
            <h2>Googleログインが必要です</h2>
            <p className="muted">
              このルームに参加するには、Googleアカウントでログインしてください。
            </p>
            <div className="room-access-actions">
              <a className="btn primary auth-action" href={loginUrl}>
                Googleでログインして参加
              </a>
              <button className="btn ghost" onClick={onBack}>
                トップへ戻る
              </button>
            </div>
          </>
        )}

        {isConfirm && (
          <>
            <h2>{ownerDisplayName ?? 'ルーム作成者'}さんのルームに参加しますか？</h2>
            <p className="muted">参加すると、このルームの対局データを閲覧・編集できます。</p>
            <div className="room-access-actions">
              <button className="btn primary" disabled={status === 'joining'} onClick={onJoin}>
                {status === 'joining' ? '参加中…' : 'このルームに参加する'}
              </button>
              <button className="btn ghost" disabled={status === 'joining'} onClick={onBack}>
                トップへ戻る
              </button>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <h2>ルームを開けませんでした</h2>
            <p className="error-text" role="alert">
              {error ?? 'ルームの確認に失敗しました'}
            </p>
            <div className="room-access-actions">
              {onRetry && (
                <button className="btn primary" onClick={onRetry}>
                  もう一度確認
                </button>
              )}
              <button className="btn ghost" onClick={onBack}>
                トップへ戻る
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
