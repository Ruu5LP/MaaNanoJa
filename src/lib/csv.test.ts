import { describe, it, expect } from 'vitest'
import { csvCell, toCSV, statsToCSV, gamesToCSV } from './csv'
import { defaultDB } from './store'

describe('csvCell', () => {
  it('通常の値はそのまま', () => {
    expect(csvCell('もっそ')).toBe('もっそ')
    expect(csvCell(77.6)).toBe('77.6')
    expect(csvCell(0)).toBe('0')
  })

  it('null/undefined は空セル', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  it('カンマ・引用符・改行を含む値は引用符で囲み、内部の " は二重化', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('a"b')).toBe('"a""b"')
    expect(csvCell('a\nb')).toBe('"a\nb"')
  })
})

describe('toCSV', () => {
  it('行を CRLF 区切りの CSV にする', () => {
    expect(
      toCSV([
        ['a', 'b'],
        [1, 2],
      ]),
    ).toBe('a,b\r\n1,2')
  })
})

describe('statsToCSV', () => {
  const csv = statsToCSV(defaultDB())
  const lines = csv.split('\r\n')

  it('ヘッダー行から始まる', () => {
    expect(lines[0]).toBe(
      'プレイヤー,戦数,合計スコア,平均スコア,平均順位,1位,2位,3位,4位,トップ率(%),連対率(%),ラス率(%),トビ率(%),平均素点,局数,和了率(%),放銃率(%),立直率(%),ツモ率(%),平均和了,平均放銃,テンパイ率(%)',
    )
  })

  it('プレイヤー数ぶんの行がある（初期データは4人）', () => {
    expect(lines.length).toBe(1 + 4)
  })

  it('局ログの無い初期データは、率系の列が空セル', () => {
    // 先頭データ行の「和了率(%)」列（index 15）は空
    const cells = lines[1]!.split(',')
    expect(cells[15]).toBe('')
  })
})

describe('gamesToCSV', () => {
  const csv = gamesToCSV(defaultDB())
  const lines = csv.split('\r\n')

  it('ヘッダー行から始まる', () => {
    expect(lines[0]).toBe('半荘,日付,メモ,席,プレイヤー,最終持ち点,順位,スコア')
  })

  it('半荘9試合 × 4人 = 36 データ行', () => {
    expect(lines.length).toBe(1 + 9 * 4)
  })

  it('game1 のトップは もっそ +77.6（既存スプレッドシートと一致）', () => {
    // 1半荘目・1位の行を探す
    const top = lines.find((l) => l.startsWith('1,') && l.includes(',1,'))
    const cells = top!.split(',')
    // 半荘=1 / 席=南 / プレイヤー=もっそ / 最終持ち点=57600 / 順位=1 / スコア=77.6
    expect(cells[4]).toBe('もっそ')
    expect(cells[5]).toBe('57600')
    expect(cells[6]).toBe('1')
    expect(cells[7]).toBe('77.6')
  })
})
