# セットアップ・使い方

麻雀トラッカー（MaaNanoJa）はCloudflare Workers + D1を本体とする共有Webアプリです。通常のDBデータはブラウザのlocalStorageや家庭内サーバーには保存しません。

## 動かす（開発）

```bash
npm install
npm run dev          # Worker + ローカルD1
```

個別の確認コマンド:

```bash
npm run build        # 本番ビルド（型チェック込み）
npm run cf:db:local  # ローカルD1へmigration適用
npm run cf:dev       # Worker + Vite成果物をローカル起動
npm run preview      # 静的ビルドの表示確認
npm test             # 単体テスト
npm run check        # typecheck + lint + format:check + test
```

アプリを使うにはルームURLが必要です。ルームURLなしで開いた場合は、ルーム作成・参加画面だけが表示されます。

## 使い方（アプリ内）

1. 「新しいルームを作る」または共有されたルームURLから参加する。
2. 「設定」タブでメンバー（最大4人ぶんの名前）とルール（持ち点・返し点・ウマ）を確認する。
3. 「記録」タブで席を選んで半荘を開始する。
   - 「局ログで記録」… 和了（ロン / ツモ）・流局・途中流局を1局ずつ記録する。
   - 「最終点だけ入力」… 終局の持ち点だけを入力する。
4. 半荘を終えると順位・スコアが自動算出され、「履歴」タブで過去の半荘と局ログを確認できる。
5. 「成績」タブのモニター表示リンクから、同じルームの大画面表示を開く。

変更はCloudflare APIを通って同じルームのD1へ保存されます。別端末では同じルームURLを開いてください。

## 旧localStorage履歴の移行

以前の版を使っていて、ブラウザに完了済み対局が残っている場合だけ、新規ルーム作成時に次の選択肢が表示されます。

- **履歴を移行して作る**: 旧履歴を新しいD1ルームへコピーする。
- **空のルームを作る**: 旧履歴を送らずに新しいルームを作る。

移行は新規ルーム作成時の明示操作に限られます。既存ルームへ参加するときに旧履歴を自動送信することはありません。移行が成功した後は旧localStorageキーを削除し、以後はD1だけを使います。重要な履歴は、移行前に旧版のJSON書き出しでバックアップしてください。

## Googleログインとアカウント

GoogleログインはCloudflare Worker内のOAuth callbackで処理します。Cloudflare Zero Trustの契約やカード登録は必要ありません。Google Cloud ConsoleでWebアプリケーションのOAuthクライアントを作成し、次を登録してください。

- 承認済みのJavaScript生成元: `https://maananaja.final0505.workers.dev`
- 承認済みのリダイレクトURI: `https://maananaja.final0505.workers.dev/auth/google/callback`

Client IDとSecretは、次のコマンドでCloudflare Worker Secretへ登録します。値はGitへ保存しないでください。

```bash
printf '%s' '<client-id>' | npx wrangler secret put GOOGLE_CLIENT_ID
printf '%s' '<client-secret>' | npx wrangler secret put GOOGLE_CLIENT_SECRET
```

ログインすると初回アクセス時にMaaNanoJaアカウントが自動作成され、作成したルームの所有者になります。共有されたルームコードで参加したルームは、そのアカウントの「自分のルーム」に表示されます。詳細は[アカウント・Googleログイン仕様](docs/account-auth-spec.md)を参照してください。

## 本番公開

1. `npx wrangler login` でCloudflareにログインする。
2. 初回だけ `npx wrangler d1 create maananaja` を実行し、表示された `database_id` を `wrangler.jsonc` に設定する。
3. `npm run cf:db:remote` でD1 migrationを適用する。
4. `npm run cf:deploy` でWorkersへ公開する。

`workers_dev` が有効なので、初期状態では `*.workers.dev` のURLでアクセスできます。公開URLを参加者へ共有すれば、別WiFiのPC・スマホから同じルームを利用できます。ルームコードを知る人は閲覧・編集できるため、必要な人だけに共有してください。

### GitHub Actionsから自動公開

`.github/workflows/deploy.yml` は、`main`へのpush時に次の順序で実行されます。

1. `npm run check`
2. `npm run build`
3. Cloudflare Workersへ `wrangler deploy`

初回だけ、GitHubリポジトリの **Settings → Secrets and variables → Actions** に次のRepository Secretを登録してください。

- `CLOUDFLARE_ACCOUNT_ID`: デプロイ先CloudflareアカウントのAccount ID
- `CLOUDFLARE_API_TOKEN`: Workersを編集できる権限に絞ったCloudflare API Token

API Tokenはリポジトリへ保存せず、CloudflareのアカウントAPI Tokenで対象アカウントだけにスコープしてください。Secretが未設定の場合はデプロイせず、GitHub Actionsにエラーを表示します。

自動公開を待たずに実行する場合は、GitHubの **Actions → Deploy Worker → Run workflow** から手動実行できます。D1 migrationはデータ変更を伴うため、自動デプロイには含めていません。migrationが必要な変更では、公開前に `npm run cf:db:remote` を別途実行してください。

## スコアのルール（初期値）

- 25,000点持ち / 30,000点返し
- ウマ 10-30（1位 +30 / 2位 +10 / 3位 -10 / 4位 -30）
- オカは（返し点 − 持ち点）× 人数を1位に自動加算
- 同点は上家（起家に近い方）優先

これらは設定画面で変更できます。計算の仕様は [SPEC.md](./SPEC.md) を参照してください。

## 開発ルール

- **[CLAUDE.md](./CLAUDE.md)** — 設計ガイド（作業前に読む）。
- **[SPEC.md](./SPEC.md)** — 振る舞いの仕様（スコア計算・データモデル・不変条件）。

## テスト

`src/lib/scoring.test.ts` に、既存スプレッドシートの過去9試合の最終持ち点 → スコアが完全一致することを検証するテストがあります。和了点の早見表・点数移動も併せて検証します。
