# MaaNanoJa アカウント・Googleログイン仕様

## 目的

Googleアカウントでログインし、ログインした人が作成したルームと対局履歴をD1で継続利用できるようにする。Cloudflare Zero TrustやAccessの有料登録は使わない。

## 認証方式

- WorkerがGoogle OAuth 2.0の認可コードフローを開始し、callbackで認可コードを交換する。
- `openid profile email` の最小スコープだけを要求し、Google UserInfo APIから認証済みプロフィールを取得する。
- OAuthの`state`とPKCEの`code_verifier`をD1へ短時間だけ保存し、CSRFと認可コード差し替えを防ぐ。
- Googleの`sub`を`users.provider_subject`へ保存する。メールアドレスは主キーにしない。
- セッションはランダムなHttpOnly/Secure/SameSite Cookieをブラウザへ渡し、D1にはセッションのSHA-256ハッシュだけを保存する。
- Client SecretはソースコードやD1へ保存せず、Cloudflare Worker Secret `GOOGLE_CLIENT_SECRET`として登録する。

## D1モデル

- `users`: MaaNanoJaのアカウント。Googleの識別子、メール、表示名を保持する。
- `rooms.owner_user_id`: ログインして作ったルームの所有者。
- `room_members`: 所有・参加の関係。ルーム作成時はownerを1件作り、ルームコードで参加した認証済みユーザーはmemberになる。
- `oauth_states`: OAuth開始からcallbackまでの短期状態。期限切れを削除する。
- `auth_sessions`: ログインセッションのハッシュと有効期限。
- `rooms`と`games`は引き続きD1だけを正式な保存先とする。

## API・認証ルート

- `GET /auth/google`: Googleの認証画面へリダイレクトする。
- `GET /auth/google/callback`: 認可コードを検証・交換し、MaaNanoJaセッションを発行する。
- `GET /auth/logout`: セッションを削除してログアウトする。
- `GET /api/me`: Googleログイン設定とMaaNanoJaアカウントを返す。
- `GET /api/my/rooms`: ログインユーザーが所有・参加しているルーム一覧を返す。
- `POST /api/rooms`: 認証済みなら作成者をownerとして保存する。Secret未登録の移行期間は既存room-code運用を維持する。
- `GET /api/rooms/:code`: 認証済みならルームコードを招待キーとしてmember登録する。
- 状態・ゲーム更新: Googleログイン設定済みのときはセッションとmember判定を通す。

## Google Cloudの設定

Google Cloud ConsoleでWebアプリケーションのOAuthクライアントを作成し、次を登録する。

- 承認済みのJavaScript生成元: `https://maananaja.final0505.workers.dev`
- 承認済みのリダイレクトURI: `https://maananaja.final0505.workers.dev/auth/google/callback`

作成したClient IDとSecretは次のコマンドでWorker Secretへ登録する。値はGitへコミットしない。

```bash
printf '%s' '<client-id>' | npx wrangler secret put GOOGLE_CLIENT_ID
printf '%s' '<client-secret>' | npx wrangler secret put GOOGLE_CLIENT_SECRET
```

その後、`/auth/google`、`/api/me`、ルーム作成、ログアウト、再ログイン後のルーム一覧を本番で確認する。
