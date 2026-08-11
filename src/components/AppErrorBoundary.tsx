import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
}

/** 予期しない描画エラーで、真っ白な画面だけを残さないための最上位境界。 */
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('app_render_error', { error: error.message, componentStack: info.componentStack })
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <main className="view" role="alert">
        <div className="card">
          <h2>画面を表示できませんでした</h2>
          <p className="muted">ページを再読み込みすると復旧する場合があります。</p>
          <button className="btn primary" onClick={() => window.location.reload()}>
            再読み込み
          </button>
        </div>
      </main>
    )
  }
}
