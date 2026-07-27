import { describe, expect, it } from 'vitest'
import { replay, rotateToDealer } from './game'
import type { Game, Rules } from './domain'

const RULES: Rules = {
  startPoints: 25000,
  returnPoints: 30000,
  uma: [30, 10, -10, -30],
  tiebreak: 'shimocha',
}

describe('rotateToDealer', () => {
  it('先頭が指定した人になるよう回転する', () => {
    expect(rotateToDealer(['a', 'b', 'c', 'd'], 'c')).toEqual(['c', 'd', 'a', 'b'])
  })

  it('既に先頭ならそのまま返す', () => {
    const seats = ['a', 'b', 'c', 'd']
    expect(rotateToDealer(seats, 'a')).toEqual(seats)
  })

  it('相対的な並び順は保持する', () => {
    expect(rotateToDealer(['a', 'b', 'c', 'd'], 'd')).toEqual(['d', 'a', 'b', 'c'])
  })
})

describe('点数修正（adjustハンド）の再生', () => {
  it('点数だけ動かし、親・本場・場風は進めない', () => {
    const game: Game = {
      id: 'g1',
      date: '',
      note: '',
      playerIds: ['A', 'B', 'C', 'D'],
      finalPoints: {},
      hands: [
        { id: 'h1', type: 'adjust', riichi: [], delta: { A: 500, B: -500 } },
        { id: 'h2', type: 'tsumo', winner: 'A', han: 3, fu: 30, riichi: [] },
      ],
    }
    const { state, steps } = replay(game, RULES)
    // 修正後もA/Bの直後の局は東1局・親Aのまま
    expect(steps[0]!.dealerIndex).toBe(0)
    expect(steps[0]!.honba).toBe(0)
    expect(steps[0]!.delta).toEqual({ A: 500, B: -500, C: 0, D: 0 })
    // 修正込みの点数がそのままツモの計算の起点になる
    expect(steps[0]!.points['A']).toBe(25500)
    expect(steps[0]!.points['B']).toBe(24500)
    // 2局目（親のツモ）が終わったあとは通常どおり連荘・本場が進む
    expect(state.dealerIndex).toBe(0)
    expect(state.honba).toBe(1)
  })
})
