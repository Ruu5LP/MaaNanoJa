# MaaNanoJa Cloudflare公開化 仕様

## Objective

MaaNanoJaをCloudflare無料枠で公開し、家麻雀の4人がルームコードだけで同じ対局に参加できるようにする。
スマホから入力した内容をPCのモニター表示へ反映し、進行中の点数と完了済み半荘の履歴を同じルームへ継続的に蓄積する。

### 利用者

- 家麻雀に参加する4人
- PC/テレビに接続したモニターを見る参加者
- スマホまたはPCから局を入力する参加者

### 成功条件

- アカウント登録なしでルームを作成・参加できる。
- ルームコードを知る参加者だけが、そのルームのデータを閲覧・編集できる。
- 同じルームを月・年をまたいで使い、半荘履歴を無期限に蓄積できる。
- スマホで確定した局の点数が、PCの `?board=1` 表示へ数秒以内に反映される。
- 完了した半荘は履歴・成績・今日/全期間の集計に残る。
- 既存のスコア計算、局ログ、JSON入出力、ローカル単独利用を壊さない。

## Assumptions

1. ルームコードは同じ4人の卓で使い回す長期的な参加キーとする。
2. ルームコードが漏れた場合、そのコードを知る人は閲覧・編集できる。アカウント認証・権限分離はMVPの対象外とする。
3. 同時に複数の局を別端末から確定する運用は想定せず、ルーム内の更新はrevisionによる楽観的競合検出で保護する。
4. 初版はWebSocketではなく、既存の1秒ポーリング方式をクラウドAPIへ移す。
5. Cloudflare Workersが静的アセットとAPIを提供し、D1が永続データを保存する。
6. 既存の `server/server.mjs` によるLANモードは削除せず、ローカル開発・従来運用用として残す。

## Tech Stack

- React 18 + Vite + TypeScript strict
- Cloudflare Workers Static Assets
- Cloudflare D1（ルーム、進行中状態、完了済みゲーム）
- Wrangler（ローカル開発、D1 migration、デプロイ）
- 既存のVitest / ESLint / Prettier

## Commands

既存コマンドは維持する。

```bash
npm install
npm run dev
npm run build
npm test
npm run check
```

Cloudflare追加後のコマンド:

```bash
npm run cf:db:local
npm run cf:dev
npm run cf:db:remote
npm run cf:deploy
```

## Project Structure

```text
src/
  lib/
    cloud-room.ts       ルームAPIの型・純粋な競合判定
    draft-stats.ts      進行中draftから現在点を算出
    *.test.ts           純粋ロジックのテスト
  views/
    RoomView.tsx        ルーム作成・参加
    BoardView.tsx       進行中点数を含むモニター表示
  useRoomSync.ts        ルームコードがある場合のクラウド同期
  App.tsx               ルーム状態と既存入力画面の接続
  BoardApp.tsx          ルームの読み取り専用モニター表示
  main.tsx              `room` と `board` のクエリ処理
worker/
  index.ts              静的アセット配信とルームAPI
migrations/
  0001_rooms.sql        rooms / games の初期スキーマ
wrangler.jsonc          Workers Static Assets とD1の設定
tasks/
  plan.md               実装計画
  todo.md               実装タスク
```

## Data Model

### rooms

- `code`：ルームコード。主キー。
- `players_json`：登録メンバー。
- `rules_json`：ルール設定。
- `draft_json`：進行中半荘。無ければNULL。
- `revision`：更新競合検出用の整数。
- `created_at` / `updated_at`：UNIXミリ秒。

### games

- `id`：ゲームID。ルーム内で一意。
- `room_code`：所属ルーム。
- `date`：`YYYY-MM-DD`。
- `game_json`：既存 `Game` 型のJSON。
- `created_at`：保存時刻。

完了済みゲームを1行ずつ保存し、ルーム全体を1つのJSON行へ詰め込まない。これにより履歴の蓄積が1行サイズに依存しない。

## API Contract

- `POST /api/rooms`：ルーム作成。ルームコードと初期状態を返す。
- `GET /api/rooms/:code`：ルーム設定、revision、draft、gamesを返す。
- `PUT /api/rooms/:code/state`：players/rules/draftをrevision付きで更新する。
- `POST /api/rooms/:code/games`：完了済みゲームを追加し、draftを確定・消去する。
- `PUT /api/rooms/:code/games/:gameId`：履歴ゲームを更新する。
- `DELETE /api/rooms/:code/games/:gameId`：履歴からゲームを削除する。

すべてのJSON入力はWorker境界で `unknown` として受け取り、既存の正規化・型検証を通す。不正なroom code、JSON、revision不一致は4xxで返す。

## Code Style

既存の純粋関数境界とアクション集約を維持する。

```ts
currentDraftPoints(draft, players, rules)
// quick は入力途中の quickPoints、live は既存 replay の現在点を返す。
```

- UI文言・コメントは日本語。
- `lib/` はReact・DOM・ネットワークIOをimportしない。
- ネットワークIOは `worker/` と `useRoomSync.ts` に閉じ込める。
- 状態変更は `App.tsx` の既存API経由にする。
- 既存のスコア計算単位・丸め・ゼロサム条件は変更しない。

## Testing Strategy

- `currentDraftPoints` とモニター用の表示モデルを純粋関数テストする。
- revision不一致、room isolation、ゲーム追加・削除のAPIをWorkerテストまたはローカルHTTP統合テストで確認する。
- 既存のscoring/game/statsテストをすべて維持する。
- `npm run check` と `npm run build` を完了条件にする。
- 手動確認では、PCをboard URL、スマホを入力URLで開き、局確定・半荘完了・再入室・全期間表示を確認する。

## Boundaries

- Always:
  - 外部入力を検証する。
  - D1のroom codeで必ずスコープする。
  - revision不一致を黙って上書きしない。
  - 既存のlocalStorage import/exportとLANモードを壊さない。
  - 変更後に `npm run check` と `npm run build` を実行する。
- Ask first:
  - 新しい本番ドメイン、公開ランキング、アカウント認証を追加する。
  - Cloudflareの有料プランや外部DBを導入する。
  - 既存のLANサーバーやデータモデルを削除する。
  - 既存localStorageの履歴を、ルーム作成時にCloudflareへ一括アップロードする。
- Never:
  - Cloudflare APIトークンやD1資格情報をリポジトリへ保存する。
  - room codeなしの全体共有DBを公開する。
  - 既存のスコア計算テストを削除・弱体化する。

## Out of Scope

- アカウント登録・ログイン・細かな権限管理
- WebSocketによるプッシュ同期
- 公開ランキングや検索エンジン向けの履歴公開
- 複数ルームを横断する統計
- カスタムドメインの設定

## Success Criteria

1. ルーム作成後、返されたURLまたはコードで別端末から参加できる。
2. 同じルームのスマホで確定した局がPCのboard画面へ最大2秒程度で反映される。
3. 進行中draftの点数・親・本場・局ログがルーム内端末で一致する。
4. 半荘を確定するとgamesへ1件だけ追加され、再入室後も履歴・成績に残る。
5. 別ルームのデータが取得・変更できない。
6. room queryなしの既存ローカル利用と、`npm run host` のLAN利用が従来どおり動く。
7. `npm run check`、`npm run build`、手動のPC/スマホ確認がすべて成功する。

## Open Questions

- MVPの公開先はCloudflareが提供する `workers.dev` URLでよい。カスタムドメインは後続とする。
- ルームコードは8文字の英数字（紛らわしい文字を除外）とする。
- ルーム作成後に保存する対局はD1へ蓄積される。既存localStorageの履歴移行は、明示的な移行導線を別タスクで追加する。
