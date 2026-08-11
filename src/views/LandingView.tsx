import RoomEntry, { type RoomEntryProps } from './RoomEntry'
import AdSenseSlot from '../components/AdSenseSlot'

export default function LandingView(props: RoomEntryProps) {
  return (
    <main className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <h2 id="landing-title">麻雀トラッカー</h2>
          <p className="landing-lead">対局の点数・局ログ・成績を記録できます。</p>
        </div>
        <RoomEntry {...props} />
      </section>

      <AdSenseSlot />

      <section className="landing-section" aria-labelledby="features-title">
        <div className="landing-section-heading">
          <h2 id="features-title">できること</h2>
          <p>記録したデータは、同じルームの中でいつでも確認できます。</p>
        </div>
        <div className="feature-grid">
          <article className="feature-card">
            <span className="feature-number">01</span>
            <h3>点数をかんたん記録</h3>
            <p>終局時の持ち点だけでも、局ごとの点数移動でも記録できます。</p>
          </article>
          <article className="feature-card">
            <span className="feature-number">02</span>
            <h3>局ログを残す</h3>
            <p>和了、放銃、立直、流局などを残して、あとから対局を振り返れます。</p>
          </article>
          <article className="feature-card">
            <span className="feature-number">03</span>
            <h3>成績を見える化</h3>
            <p>合計スコア、平均順位、着順分布、和了率などを自動で集計します。</p>
          </article>
          <article className="feature-card">
            <span className="feature-number">04</span>
            <h3>モニターに表示</h3>
            <p>別のPCやテレビにスコアボードを映して、卓上の順位を共有できます。</p>
          </article>
        </div>
      </section>

      <section className="landing-section landing-howto" aria-labelledby="howto-title">
        <div className="landing-section-heading">
          <h2 id="howto-title">使い方</h2>
          <p>ルームを作って、メンバーと共有するだけです。</p>
        </div>
        <ol className="steps-list">
          <li>
            <span className="step-number">01</span>
            <div>
              <h3>ルームを作る</h3>
              <p>新しいルームを作成し、表示されたURLをメンバーに共有します。</p>
            </div>
          </li>
          <li>
            <span className="step-number">02</span>
            <div>
              <h3>メンバーを登録する</h3>
              <p>4人の名前とルールを設定したら、対局の準備は完了です。</p>
            </div>
          </li>
          <li>
            <span className="step-number">03</span>
            <div>
              <h3>対局を記録する</h3>
              <p>スマホから入力しながら、全員で同じスコアと局ログを確認できます。</p>
            </div>
          </li>
        </ol>
      </section>

      <footer className="landing-footer">
        <span>麻雀トラッカー · AiRuu Mahjong</span>
        <nav aria-label="開発者リンク">
          <a
            className="social-link"
            href="https://github.com/Ruu5LP"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHubのプロフィールを開く"
          >
            <svg className="social-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 .3a12 12 0 0 0-3.8 23.38c.6.12.82-.26.82-.58v-2.02c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.74.08-.74 1.2.08 1.83 1.24 1.83 1.24 1.07 1.83 2.8 1.3 3.48 1 .11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.8 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 .3Z" />
            </svg>
            <span>GitHub</span>
          </a>
          <a
            className="social-link"
            href="https://x.com/Ruu5LP"
            target="_blank"
            rel="noreferrer"
            aria-label="Xのプロフィールを開く"
          >
            <svg className="social-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.22-6.82-5.96 6.82H1.68l7.73-8.84-8.16-10.66H8.08l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64Z" />
            </svg>
            <span>X</span>
          </a>
          <a className="footer-link" href="/privacy">
            プライバシー
          </a>
          <a className="footer-link" href="/terms">
            利用規約
          </a>
        </nav>
      </footer>
    </main>
  )
}
