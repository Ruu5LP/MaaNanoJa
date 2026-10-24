import { Fragment, useMemo, useState } from 'react'
import type { DB, Player } from '../lib/domain'
import { computeOpponentStats } from '../lib/opponent-stats'

const points = (value: number) => value.toLocaleString('ja-JP')

function TransferDirection({ loser, winner }: { loser: string; winner: string }) {
  return (
    <span className="transfer-direction" aria-label={`${loser}から${winner}への放銃`}>
      <span>{loser}</span>
      <span className="transfer-arrow" aria-hidden="true">
        →
      </span>
      <span>{winner}</span>
    </span>
  )
}

export default function OpponentStatsPanel({ db, players }: { db: DB; players: Player[] }) {
  const [selectedId, setSelectedId] = useState('')
  // 期間変更で選択者が対象外になったら、表示中の先頭へ戻す。
  const selected = players.find((player) => player.id === selectedId) ?? players[0]
  const playerId = selected?.id ?? ''
  const { opponents, details } = useMemo(() => computeOpponentStats(db, playerId), [db, playerId])
  const name = (id: string) =>
    players.find((player) => player.id === id)?.name ?? '削除されたメンバー'

  return (
    <section className="card opponent-panel" aria-labelledby="opponent-title">
      <h2 id="opponent-title">相手別のロン・放銃</h2>
      <fieldset className="opponent-player">
        <legend>表示する人</legend>
        <div className="opponent-player-options">
          {players.map((player) => (
            <button
              key={player.id}
              type="button"
              className={`pill ${player.id === playerId ? 'on' : ''}`}
              aria-pressed={player.id === playerId}
              onClick={() => setSelectedId(player.id)}
            >
              {player.name}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="table-hint">
        矢印は放銃者 → 和了者。単位は点、差し引きは基本点のみです。左右にスクロールできます。
      </p>
      {details.length === 0 ? (
        <p className="muted">この期間には、選択した人のロン・放銃の記録がありません。</p>
      ) : (
        <>
          <div className="table-wrap" role="region" aria-label="相手別の点数内訳" tabIndex={0}>
            <table className="opponent-table">
              <thead>
                <tr>
                  <th scope="col">相手・差し引き</th>
                  <th scope="col">放銃者 → 和了者</th>
                  <th scope="col">回数</th>
                  <th scope="col">基本点</th>
                  <th scope="col">本場</th>
                  <th scope="col">リー棒移動</th>
                </tr>
              </thead>
              <tbody>
                {opponents.map((opponent) => (
                  <Fragment key={opponent.opponent.id}>
                    {(['ron', 'houju'] as const).map((direction, index) => (
                      <tr key={direction}>
                        {index === 0 && (
                          <th scope="rowgroup" rowSpan={2}>
                            {opponent.opponent.name}
                            <small className={opponent.netBase >= 0 ? 'pos' : 'neg'}>
                              {opponent.netBase > 0 ? '+' : ''}
                              {points(opponent.netBase)}点
                            </small>
                          </th>
                        )}
                        <td>
                          <TransferDirection
                            loser={direction === 'ron' ? opponent.opponent.name : name(playerId)}
                            winner={direction === 'ron' ? name(playerId) : opponent.opponent.name}
                          />
                        </td>
                        <td className="num">{opponent[direction].count}</td>
                        <td className="num opponent-base">{points(opponent[direction].base)}</td>
                        <td className="num">{points(opponent[direction].honba)}</td>
                        <td className="num">{points(opponent[direction].pot)}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="opponent-note">
            リー棒移動は供託から和了者への受け渡しです。放銃者がその全額を支払ったことを表しません。
          </p>
          <h3>局ごとの明細</h3>
          <p id="opponent-detail-hint" className="table-hint">
            全{details.length}件。明細が長い場合は、表の中を上下にスクロールできます。
          </p>
          <div
            className="table-wrap opponent-detail-scroll"
            role="region"
            aria-label="局ごとの点数内訳"
            aria-describedby="opponent-detail-hint"
            tabIndex={0}
          >
            <table className="opponent-table opponent-detail-table">
              <thead>
                <tr>
                  <th scope="col">局</th>
                  <th scope="col">放銃者 → 和了者</th>
                  <th scope="col">基本点</th>
                  <th scope="col">本場</th>
                  <th scope="col">リー棒移動</th>
                  <th scope="col">{selected?.name}の受取・支払</th>
                </tr>
              </thead>
              <tbody>
                {details.map((detail) => (
                  <tr key={`${detail.gameId}-${detail.handId}-${detail.winnerId}`}>
                    <th scope="row">
                      #{detail.gameNumber} {detail.label}
                      <small>{detail.date || '日付なし'}</small>
                    </th>
                    <td>
                      <TransferDirection
                        loser={name(detail.loserId)}
                        winner={name(detail.winnerId)}
                      />
                    </td>
                    <td className="num opponent-base">{points(detail.base)}</td>
                    <td className="num">{points(detail.honba)}</td>
                    <td className="num">{points(detail.pot)}</td>
                    <td className={`num ${detail.direction === 'ron' ? 'pos' : 'neg'}`}>
                      {points(detail.total)}
                      <small>{detail.direction === 'ron' ? '受取' : '支払'}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="opponent-note">
            受取は基本点・本場・リー棒の合計、支払は基本点・本場の合計です。ダブロンは和了者ごとに表示します。
          </p>
        </>
      )}
    </section>
  )
}
