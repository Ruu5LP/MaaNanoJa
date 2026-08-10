# MaaNanoJa アカウント・Googleログイン仕様

## 目的

Googleアカウントで簡単にログインし、ログインした人が作成したルームと対局履歴をD1で継続利用できるようにする。

## 認証方式

- Google OAuthの実装やパスワード管理はMaaNanoJaに持たせない。
- Cloudflare AccessでGoogleをIdentity Providerとして設定し、Workerの`ctx.access.getIdentity()`から認証済みユーザーを受け取る。
- 初回ログイン時に、Accessのユーザー識別子を`users.provider_subject`へ保存してMaaNanoJaユーザーを自動作成する。
- メールアドレスではなく、Accessが返す`user_uuid`を主識別子として優先する。メールアドレスは表示・連絡用データとして更新可能にする。

## D1モデル

- `users`: MaaNanoJaのアカウント。Google/Accessの識別子、メール、表示名を保持する。
- `rooms.owner_user_id`: ログインして作ったルームの所有者。
- `room_members`: 所有・参加の関係。ルーム作成時はownerを1件作り、ルームコードで参加した認証済みユーザーはmemberになる。
- `rooms`と`games`は引き続きD1だけを正式な保存先とする。

## API

- `GET /api/me`: Accessの認証状態とMaaNanoJaアカウントを返す。
- `GET /api/my/rooms`: ログインユーザーが所有・参加しているルーム一覧を返す。
- `POST /api/rooms`: 認証済みなら作成者をownerとして保存する。旧環境との切り替え中はAccess未設定時のroom-code運用も維持する。
- `GET /api/rooms/:code`: 認証済みならルームコードを招待キーとしてmember登録し、以後の利用対象にする。
- 状態・ゲーム更新: Access認証済みのときは同じmember判定を通す。

## 画面仕様

- ルーム未選択画面に「Googleでログイン」を表示する。
- 初回ログイン後は別のアカウント作成画面を出さず、そのままMaaNanoJaアカウントを作る。
- ログイン済みなら「自分のルーム」に所有・参加ルームと対局件数を表示する。
- ルームコードはログイン後も招待用URLとして使う。アカウントのパスワードやローカルストレージを新設しない。

## Cloudflare側の本番設定

1. Google Cloud ConsoleでOAuthクライアントを作成する。
2. Cloudflare Zero TrustのAuthentication > Login methodsでGoogleを追加する。
3. Googleの承認済みリダイレクトURIに、Cloudflare Accessが表示する`https://<team-name>.cloudflareaccess.com/cdn-cgi/access/callback`を登録する。
4. Access applicationで`maananaja.final0505.workers.dev`のWorkerを保護し、Googleを許可するポリシーを設定する。
5. ログイン後、`/api/me`でアカウント作成、ルーム作成、再ログイン後のルーム一覧を確認する。

Access未設定のデプロイでは既存のルームコード運用を壊さないため、アカウント機能は「設定待ち」と表示する。Accessを有効にした時点で、APIは認証済みのユーザーとルームメンバー関係を使う。
