// LAN同期サーバ（依存ゼロ・Node標準モジュールのみ）。
//
// 何をするか:
//   - ビルド済みアプリ（dist/）を配信する
//   - GET  /api/db   … いま共有中のDBを返す（無ければ db:null, rev:0）
//   - PUT  /api/db   … 送られたDBを保存し、revを1つ進めて返す
//   - GET  /api/live … 入力中の実況（誰かが今打っている半荘）を返す。無ければ live:null
//   - PUT  /api/live … 入力中の実況を差し替える（null で消える）
//
// 実況（/api/live）はメモリ上だけに持つ＝ファイルにも db.json にも残さない。
// 「今まさに入力している中身」を他端末の画面へライブで映すための一時状態で、消えていい。
//
// これで「PCで起動 → PCもスマホも同じURLを開く → 同じデータを見て・書ける」を実現する。
// データは server/data/db.json に置く（外部クラウドには一切出さない＝LAN内で完結）。
//
// 使い方:
//   npm run host   # ビルドしてから起動（家麻雀当日はこれ1つ）
//   npm run serve  # ビルド済みなら起動だけ

import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, normalize, extname } from 'node:path'
import { networkInterfaces } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = dirname(__dirname) // リポジトリのルート
const DIST_DIR = join(ROOT, 'dist')
const DATA_DIR = join(__dirname, 'data')
const DATA_FILE = join(DATA_DIR, 'db.json')

const PORT = Number(process.env.PORT ?? 5180)
const HOST = process.env.HOST ?? '0.0.0.0' // LAN内の他端末から届くよう全インターフェースで待つ

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
}

/** 現在の共有状態 { rev, db } を読む。ファイルが無ければ初期値。 */
async function readState() {
  try {
    const raw = await readFile(DATA_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return { rev: Number(parsed.rev) || 0, db: parsed.db ?? null }
  } catch {
    return { rev: 0, db: null }
  }
}

/** 共有状態を保存し、新しい state を返す。 */
async function writeState(state) {
  await mkdir(DATA_DIR, { recursive: true })
  await writeFile(DATA_FILE, JSON.stringify(state), 'utf8')
  return state
}

/** リクエストのbodyを最大2MBまで読み取る。 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > 2_000_000) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

// 入力中の実況（メモリのみ。サーバを止めれば消える。ファイルには残さない）。
let liveInput = null // 直近の実況ペイロード（無ければ null）
let liveTs = 0 // 最終更新時刻（サーバ時計, ms）。端末間の時計ズレを避けるため鮮度判定はこれで行う。

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

/** dist/ から静的ファイルを返す。無ければ index.html（SPA）にフォールバック。 */
async function serveStatic(req, res, urlPath) {
  if (!existsSync(DIST_DIR)) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('dist/ がありません。先に `npm run build` してください。')
    return
  }
  const cleanPath = urlPath === '/' ? '/index.html' : urlPath
  // パストラバーサル対策: 正規化した実パスが必ず DIST_DIR 配下に収まることを確認する。
  const filePath = normalize(join(DIST_DIR, decodeURIComponent(cleanPath)))
  const target = filePath.startsWith(DIST_DIR) ? filePath : null

  let data = null
  if (target && existsSync(target) && extname(target)) {
    data = await readFile(target).catch(() => null)
  }
  if (data == null) {
    // 未知パスは index.html を返す（クライアント側ルーティング用）。
    data = await readFile(join(DIST_DIR, 'index.html')).catch(() => null)
    if (data == null) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('not found')
      return
    }
    res.writeHead(200, htmlHeaders())
    res.end(data)
    return
  }
  // index.html（エントリHTML）だけは毎回新しく取りに行かせる。
  // これがキャッシュされると、再ビルドしても古いJS/CSSを指したままになり
  // 「更新したのに画面が変わらない」が起きる。JS/CSSはファイル名にハッシュが
  // 付く（内容が変われば別名）ので、そちらはキャッシュされて問題ない。
  const isHtml = extname(target) === '.html'
  res.writeHead(
    200,
    isHtml
      ? htmlHeaders()
      : { 'Content-Type': MIME[extname(target)] ?? 'application/octet-stream' },
  )
  res.end(data)
}

/** HTML（エントリ）用のヘッダ。キャッシュ無効で毎回最新を取りに行かせる。 */
function htmlHeaders() {
  return { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

    if (url.pathname === '/api/db') {
      if (req.method === 'OPTIONS') return sendJson(res, 204, {})
      if (req.method === 'GET') return sendJson(res, 200, await readState())
      if (req.method === 'PUT') {
        const body = await readBody(req)
        const parsed = JSON.parse(body || '{}')
        if (parsed.db == null) return sendJson(res, 400, { error: 'db がありません' })
        const prev = await readState()
        const next = await writeState({ rev: prev.rev + 1, db: parsed.db })
        return sendJson(res, 200, { rev: next.rev })
      }
      return sendJson(res, 405, { error: 'method not allowed' })
    }

    if (url.pathname === '/api/live') {
      if (req.method === 'OPTIONS') return sendJson(res, 204, {})
      // ts/now を両方サーバ時計で返す。受信側はこの差だけで鮮度を測れる。
      if (req.method === 'GET')
        return sendJson(res, 200, { live: liveInput, ts: liveTs, now: Date.now() })
      if (req.method === 'PUT') {
        const body = await readBody(req)
        const parsed = JSON.parse(body || '{}')
        liveInput = parsed.live ?? null
        liveTs = Date.now()
        return sendJson(res, 200, { ok: true })
      }
      return sendJson(res, 405, { error: 'method not allowed' })
    }

    if (req.method === 'GET') return await serveStatic(req, res, url.pathname)
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('method not allowed')
  } catch (e) {
    sendJson(res, 500, { error: String(e && e.message ? e.message : e) })
  }
})

/** LAN内の他端末から開けるIPv4アドレス一覧。 */
function lanAddresses() {
  const out = []
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address)
    }
  }
  return out
}

server.listen(PORT, HOST, () => {
  const ips = lanAddresses()
  console.log('\n🀄  麻雀トラッカー LAN同期サーバ 起動\n')
  console.log('  同じWiFiにつないだ端末で、下のURLを開いてください:')
  if (ips.length === 0) {
    console.log(`    このPC        http://localhost:${PORT}`)
  } else {
    for (const ip of ips) console.log(`    スマホ/他端末  http://${ip}:${PORT}`)
    console.log(`    このPC        http://localhost:${PORT}`)
  }
  console.log('\n  止めるときは Ctrl+C。データは server/data/db.json に保存されます。\n')
})
