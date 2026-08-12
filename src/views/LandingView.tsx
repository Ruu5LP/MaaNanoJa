import RoomEntry, { type RoomEntryProps } from './RoomEntry'
import AdSenseSlot from '../components/AdSenseSlot'
import recordScreenshot from '../../docs/screenshots/record-view.svg'
import statsScreenshot from '../../docs/screenshots/stats-view.svg'
import boardScreenshot from '../../docs/screenshots/board-view.svg'

export default function LandingView(props: RoomEntryProps) {
  return (
    <main className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <h1 id="landing-title">麻雀トラッカー</h1>
          <p className="landing-lead">
            4人打ち麻雀の対局を、局ごとに記録・共有。
            <br />
            点数計算から成績の振り返りまで、これひとつで。
          </p>
        </div>
        <RoomEntry {...props} />
      </section>

      <AdSenseSlot />

      <section className="landing-showcase" aria-labelledby="showcase-title">
        <div className="landing-section-heading">
          <h2 id="showcase-title">記録した内容は、こう見えます。</h2>
          <p>点数の記録から成績の確認まで、同じルームで使えます。</p>
        </div>
        <article className="showcase-row">
          <div className="showcase-copy">
            <span className="showcase-kicker">記録</span>
            <h3>点数を記録する</h3>
            <p>半荘の結果だけでも、局ごとの点数移動でも記録できます。</p>
          </div>
          <figure className="showcase-media">
            <img src={recordScreenshot} alt="局ログを入力している記録画面" loading="eager" />
          </figure>
        </article>
        <article className="showcase-row reverse">
          <div className="showcase-copy">
            <span className="showcase-kicker">成績</span>
            <h3>成績を振り返る</h3>
            <p>合計スコアや順位、和了率などを自動で集計します。</p>
          </div>
          <figure className="showcase-media">
            <img src={statsScreenshot} alt="成績を確認する画面" loading="lazy" />
          </figure>
        </article>
        <article className="showcase-row">
          <div className="showcase-copy">
            <span className="showcase-kicker">モニター</span>
            <h3>卓の横に表示する</h3>
            <p>別のPCやテレビに、現在の順位を表示できます。</p>
          </div>
          <figure className="showcase-media">
            <img
              src={boardScreenshot}
              alt="大画面に現在の順位を表示するモニター画面"
              loading="lazy"
            />
          </figure>
        </article>
      </section>

      <footer className="landing-footer">
        <span>麻雀トラッカー</span>
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
