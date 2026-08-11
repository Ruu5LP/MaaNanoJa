import RoomEntry, { type RoomEntryProps } from './RoomEntry'

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
          <a href="https://github.com/Ruu5LP" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href="https://x.com/Ruu5LP" target="_blank" rel="noreferrer">
            X
          </a>
        </nav>
      </footer>
    </main>
  )
}
