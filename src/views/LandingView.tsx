import RoomEntry, { type RoomEntryProps } from './RoomEntry'

export default function LandingView(props: RoomEntryProps) {
  return (
    <main className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <p className="landing-eyebrow">AiRuu Mahjong</p>
          <h2 id="landing-title">麻雀の対局を、みんなで記録・共有</h2>
          <p className="landing-lead">
            半荘の点数、局ログ、成績まで。スマホとPCを同じルームにつないで使えます。
          </p>
          <div className="landing-highlights" aria-label="主な特徴">
            <span>ルーム共有</span>
            <span>局ログ対応</span>
            <span>成績を自動集計</span>
          </div>
        </div>
        <RoomEntry {...props} />
      </section>

      <section className="landing-section" aria-labelledby="features-title">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">Features</p>
          <h2 id="features-title">記録から振り返りまで、ひとつのルームで</h2>
        </div>
        <div className="feature-grid">
          <article className="feature-card">
            <span className="feature-icon" aria-hidden="true">
              🀄
            </span>
            <h3>点数をかんたん記録</h3>
            <p>終局時の持ち点だけでも、局ごとの点数移動でも記録できます。</p>
          </article>
          <article className="feature-card">
            <span className="feature-icon" aria-hidden="true">
              📝
            </span>
            <h3>局ログを残す</h3>
            <p>和了、放銃、立直、流局などを残して、あとから対局を振り返れます。</p>
          </article>
          <article className="feature-card">
            <span className="feature-icon" aria-hidden="true">
              📊
            </span>
            <h3>成績を見える化</h3>
            <p>合計スコア、平均順位、着順分布、和了率などを自動で集計します。</p>
          </article>
          <article className="feature-card">
            <span className="feature-icon" aria-hidden="true">
              🖥️
            </span>
            <h3>モニターに表示</h3>
            <p>別のPCやテレビにスコアボードを映して、卓上の順位を共有できます。</p>
          </article>
        </div>
      </section>

      <section className="landing-section landing-howto" aria-labelledby="howto-title">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">How to use</p>
          <h2 id="howto-title">3ステップですぐに使えます</h2>
        </div>
        <ol className="steps-list">
          <li>
            <span className="step-number">1</span>
            <div>
              <h3>ルームを作る</h3>
              <p>新しいルームを作成し、表示されたURLをメンバーに共有します。</p>
            </div>
          </li>
          <li>
            <span className="step-number">2</span>
            <div>
              <h3>メンバーを登録する</h3>
              <p>4人の名前とルールを設定したら、対局の準備は完了です。</p>
            </div>
          </li>
          <li>
            <span className="step-number">3</span>
            <div>
              <h3>対局を記録する</h3>
              <p>スマホから入力しながら、全員で同じスコアと局ログを確認できます。</p>
            </div>
          </li>
        </ol>
      </section>

      <section className="landing-final" aria-labelledby="final-title">
        <p className="landing-eyebrow">Ready to play?</p>
        <h2 id="final-title">まずはルームを作って、対局を始めよう</h2>
        <p>作成したルームは、共有URLからいつでも続きが開けます。</p>
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
