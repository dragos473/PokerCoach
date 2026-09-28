/**
 * Built-in range charts.
 *
 * These are APPROXIMATE BASELINE CHARTS written in range notation: simplified, human-readable
 * starting points in the spirit of common solver-derived charts, NOT solver outputs. Mixed hands
 * are rounded to 25/50/75 %. Every chart carries its assumptions, which the UI always shows.
 * Everything here is editable in the app (edits are stored as overrides; "restore baseline" undoes them).
 *
 * Computed charts (heads-up push/fold) are not written here: they are solved by the engine
 * (engine/pushfold.ts) and listed in `COMPUTED_CHARTS`.
 *
 * Layers: `raise` = open / 3-bet / 4-bet / shove (depending on the scenario), `call` = flat call.
 * Anything not in a layer folds. For each combo, raise + call must be <= 100 % (checked by tests).
 */
import type { RangeFormat, RangeScenario } from '../../db/types'

export interface BaselineChart {
  id: string
  name: string
  format: RangeFormat
  scenario: RangeScenario
  position: string
  vsPosition?: string
  stackBB: number
  raise: string
  call?: string
  assumptions: string
}

export interface ComputedChart {
  id: string
  name: string
  format: RangeFormat
  scenario: RangeScenario
  position: string
  vsPosition?: string
  stackBB: number
  ante: number
  side: 'sb-push' | 'bb-call'
  assumptions: string
}

const CASH6 =
  'Approximate baseline chart (not a solver output). 6-max cash, 100 bb effective, open 2.5 bb (SB 3 bb), ' +
  'no ante, typical online rake (~5 % capped). 3-bets ≈ 3× in position, ≈ 3.5–4× out of position; 4-bets ≈ 2.2–2.5×. ' +
  'Mixed hands rounded to 25/50/75 %.'
const CASH9 =
  'Approximate baseline chart (not a solver output). 9-max full-ring cash, 100 bb effective, open 2.5 bb (SB 3 bb), ' +
  'no ante, typical online rake. Mixed hands rounded to 25/50/75 %.'
const MTT40 =
  'Approximate baseline chart (not a solver output). 8-max MTT, 40 bb effective, open ≈ 2.2 bb, ante 0.125 bb per player ' +
  '(BB-ante equivalent), chip EV, no ICM pressure (early/middle stage). SB simplified to raise-or-fold.'

// --------------------------------------------------------------------------------- 6-max cash
const RFI6 = {
  UTG: '55+, 44-22:50%, A2s+, KTs+, K9s:50%, Q9s+, J9s+, T9s, 98s:50%, 87s:50%, 76s:50%, 65s:50%, ATo+, KJo+, QJo:50%',
  HJ: '22+, A2s+, K8s+, Q9s+, J9s+, T8s+, 97s+, 87s, 76s, 65s, 54s:50%, ATo+, A9o:50%, KTo+, QJo, QTo:50%',
  CO: '22+, A2s+, K5s+, Q8s+, J8s+, T8s+, T7s:50%, 97s+, 86s+, 75s+, 65s, 64s:50%, 54s, A8o+, A5o:50%, KTo+, K9o:50%, QTo+, JTo',
  BTN: '22+, A2s+, K2s+, Q4s+, J6s+, T6s+, 96s+, 85s+, 75s+, 64s+, 53s+, 43s, A2o+, K8o+, Q9o+, J9o+, T8o+, 98o, 87o:50%',
  SB: '22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 96s+, 85s+, 75s+, 64s+, 53s+, 43s, A2o+, K8o+, Q9o+, J9o+, T8o+, 98o, 87o:50%',
}

const BB_VS_BTN = {
  raise: 'TT+, AJs+, AQo+, A5s-A2s:50%, KTs:50%, K9s:50%, K5s-K4s:50%, Q9s:50%, J9s:50%, T8s:50%, 97s:50%, 86s:50%, 75s:50%, 65s:50%, 54s:50%',
  call:
    '99-22, ATs-A6s, A5s-A2s:50%, KQs-KJs, KTs:50%, K9s:50%, K8s-K6s, K5s-K4s:50%, K3s-K2s, QJs-QTs, Q9s:50%, Q8s-Q2s, ' +
    'JTs, J9s:50%, J8s-J4s, T9s, T8s:50%, T7s-T6s, 98s, 97s:50%, 96s, 87s, 86s:50%, 85s, 76s, 75s:50%, 74s, 65s:50%, 64s, 63s, ' +
    '54s:50%, 53s, 43s, AJo-A2o, KQo-KTo, K9o-K7o, QJo-QTo, Q9o-Q8o, JTo-J8o, T9o-T8o, 98o, 97o:50%, 87o, 76o:50%',
}

export const BASELINE_CHARTS: BaselineChart[] = [
  ...(['UTG', 'HJ', 'CO', 'BTN', 'SB'] as const).map((pos) => ({
    id: `c6-rfi-${pos.toLowerCase()}`,
    name: `6-max ${pos} open`,
    format: '6max-cash' as const,
    scenario: 'rfi' as const,
    position: pos,
    stackBB: 100,
    raise: RFI6[pos],
    assumptions: CASH6 + (pos === 'SB' ? ' SB plays raise-or-fold (no limping).' : ''),
  })),
  {
    id: 'c6-hj-vs-utg', name: '6-max HJ vs UTG open', format: '6max-cash', scenario: 'vs-open', position: 'HJ', vsPosition: 'UTG', stackBB: 100,
    raise: 'QQ+, AKs, AKo, AQs:50%, A5s-A4s:50%, KQs:50%',
    call: 'JJ-99, 88-66:50%, AQs:50%, AJs, ATs:50%, KQs:50%, KJs:50%, QJs:50%, JTs:50%, T9s:25%',
    assumptions: CASH6,
  },
  {
    id: 'c6-co-vs-utg', name: '6-max CO vs UTG open', format: '6max-cash', scenario: 'vs-open', position: 'CO', vsPosition: 'UTG', stackBB: 100,
    raise: 'QQ+, AKs, AKo, AQs:50%, A5s-A4s:50%, KQs:50%, 76s:25%',
    call: 'JJ-77, 66:50%, AQs:50%, AJs, ATs, KQs:50%, KJs, QJs, JTs, T9s:50%',
    assumptions: CASH6,
  },
  {
    id: 'c6-co-vs-hj', name: '6-max CO vs HJ open', format: '6max-cash', scenario: 'vs-open', position: 'CO', vsPosition: 'HJ', stackBB: 100,
    raise: 'JJ+, AQs+, AKo, AJs:50%, A5s-A3s, KQs:50%, KJs:50%, 76s:25%, 65s:25%',
    call: 'TT-66, 55:50%, AJs:50%, ATs, KQs:50%, KJs:50%, KTs, QJs, QTs:50%, JTs, T9s, 98s:50%, AQo:50%',
    assumptions: CASH6,
  },
  {
    id: 'c6-btn-vs-utg', name: '6-max BTN vs UTG open', format: '6max-cash', scenario: 'vs-open', position: 'BTN', vsPosition: 'UTG', stackBB: 100,
    raise: 'QQ+, AKs, AKo, A5s:50%, KQs:50%, AQs:25%',
    call: 'JJ-22, AQs:75%, AJs-ATs, A9s:50%, AQo, KQs:50%, KJs, KTs:50%, QJs, QTs:50%, JTs, T9s, 98s, 87s:50%, 76s:50%',
    assumptions: CASH6,
  },
  {
    id: 'c6-btn-vs-co', name: '6-max BTN vs CO open', format: '6max-cash', scenario: 'vs-open', position: 'BTN', vsPosition: 'CO', stackBB: 100,
    raise: 'TT+, AJs+, AQo+, A5s-A2s, KQs, KJs:50%, K9s:50%, Q9s:50%, J9s:50%, T8s:50%, 76s:50%, 65s:50%',
    call: '99-22, ATs-A6s, KJs:50%, KTs, QJs-QTs, JTs, J9s:50%, T9s, T8s:50%, 98s, 87s, 76s:50%, 65s:50%, AJo, KQo',
    assumptions: CASH6,
  },
  {
    id: 'c6-sb-vs-btn', name: '6-max SB vs BTN open', format: '6max-cash', scenario: 'vs-open', position: 'SB', vsPosition: 'BTN', stackBB: 100,
    raise: '77+, 66-55:50%, A8s+, A5s-A3s, A7s-A6s:50%, KTs+, K9s:50%, QTs+, JTs, T9s:50%, 98s:50%, 87s:25%, AJo+, ATo:50%, KQo, KJo:50%',
    assumptions: CASH6 + ' SB plays 3-bet-or-fold (no flatting), ≈ 4× 3-bet.',
  },
  {
    id: 'c6-bb-vs-utg', name: '6-max BB vs UTG open', format: '6max-cash', scenario: 'vs-open', position: 'BB', vsPosition: 'UTG', stackBB: 100,
    raise: 'QQ+, AKs, AKo:75%, A5s:50%',
    call: 'JJ-22, AQs-A6s, A5s:50%, A4s-A2s, AKo:25%, AQo-AJo, KQs-K9s, KQo, QJs-Q9s, JTs-J9s, T9s-T8s, 98s-97s, 87s-86s, 76s-75s, 65s-64s, 54s',
    assumptions: CASH6,
  },
  {
    id: 'c6-bb-vs-co', name: '6-max BB vs CO open', format: '6max-cash', scenario: 'vs-open', position: 'BB', vsPosition: 'CO', stackBB: 100,
    raise: 'JJ+, AQs+, AKo, A5s-A4s:50%, KJs:50%, 76s:25%, 65s:25%',
    call:
      'TT-22, AJs-A6s, A5s-A4s:50%, A3s-A2s, AQo-ATo, KQs, KJs:50%, KTs-K6s, KQo-KJo, QJs-Q8s, QJo, JTs-J8s, JTo, ' +
      'T9s-T7s, 98s-96s, 87s-85s, 76s:75%, 75s-74s, 65s:75%, 64s, 54s, 53s, 43s:50%',
    assumptions: CASH6,
  },
  {
    id: 'c6-bb-vs-btn', name: '6-max BB vs BTN open', format: '6max-cash', scenario: 'vs-open', position: 'BB', vsPosition: 'BTN', stackBB: 100,
    raise: BB_VS_BTN.raise, call: BB_VS_BTN.call, assumptions: CASH6,
  },
  {
    id: 'c6-bb-vs-sb', name: '6-max BB vs SB open', format: '6max-cash', scenario: 'vs-open', position: 'BB', vsPosition: 'SB', stackBB: 100,
    raise: '99+, A8s+, A5s-A2s:50%, KTs+, QJs, AJo+, KQo, T9s:50%, 76s:50%, 65s:50%',
    call:
      '88-22, A7s-A6s, A5s-A2s:50%, K9s-K2s, QTs-Q2s, JTs-J2s, T9s:50%, T8s-T3s, 98s-94s, 87s-84s, 76s:50%, 75s-73s, ' +
      '65s:50%, 64s-63s, 54s-52s, 43s, ATo-A2o, KJo-K5o, QJo-QTo, Q9o-Q7o, JTo-J8o, T9o-T8o, 98o, 97o, 87o, 76o, 65o',
    assumptions: CASH6 + ' SB opens 3 bb.',
  },
  {
    id: 'c6-utg-vs-3bet', name: '6-max UTG open vs BTN 3-bet', format: '6max-cash', scenario: 'vs-3bet', position: 'UTG', vsPosition: 'BTN', stackBB: 100,
    raise: 'KK+, AKs, AKo:50%, AQs:25%, A5s:50%',
    call: 'QQ-TT, 99:50%, AKo:50%, AQs:75%, AJs, ATs:50%, KQs, KJs:50%, QJs:50%, JTs:50%',
    assumptions: CASH6 + ' Facing a 3-bet to ≈ 7.5 bb from a player in position.',
  },
  {
    id: 'c6-co-vs-3bet', name: '6-max CO open vs BTN 3-bet', format: '6max-cash', scenario: 'vs-3bet', position: 'CO', vsPosition: 'BTN', stackBB: 100,
    raise: 'QQ+, AKs, AKo, A5s-A4s:50%',
    call: 'JJ-77, AQs-ATs, A5s-A4s:50%, AQo:50%, KQs-KTs, QJs, JTs, T9s, 98s:50%',
    assumptions: CASH6 + ' Facing a 3-bet to ≈ 7.5 bb from a player in position.',
  },
  {
    id: 'c6-btn-vs-bb3bet', name: '6-max BTN open vs BB 3-bet', format: '6max-cash', scenario: 'vs-3bet', position: 'BTN', vsPosition: 'BB', stackBB: 100,
    raise: 'QQ+, AKs, AKo:75%, A5s-A4s:50%',
    call: 'JJ-55, AQs-A6s, A5s-A4s:50%, A3s-A2s, AKo:25%, AQo, AJo:50%, KQs-K9s, KQo, QJs-Q9s, JTs-J9s, T9s-T8s, 98s-97s, 87s, 76s, 65s, 54s',
    assumptions: CASH6 + ' Facing a 3-bet to ≈ 11 bb out of position; we are in position.',
  },
  {
    id: 'c6-btn-vs-sb3bet', name: '6-max BTN open vs SB 3-bet', format: '6max-cash', scenario: 'vs-3bet', position: 'BTN', vsPosition: 'SB', stackBB: 100,
    raise: 'QQ+, AKs, AKo:75%, A5s:50%',
    call: 'JJ-66, AQs-A7s, A5s:50%, A4s, AKo:25%, AQo, KQs-KTs, KQo:50%, QJs-QTs, JTs, T9s, 98s, 87s, 76s:50%, 65s:50%',
    assumptions: CASH6 + ' Facing a 3-bet to ≈ 11 bb; we are in position.',
  },
  {
    id: 'c6-sb-vs-bb3bet', name: '6-max SB open vs BB 3-bet', format: '6max-cash', scenario: 'vs-3bet', position: 'SB', vsPosition: 'BB', stackBB: 100,
    raise: 'QQ+, AKs, AKo, A5s:50%',
    call: 'JJ-66, AQs-A6s, A5s:50%, A4s-A2s:50%, AQo, KQs-K9s, KQo:50%, QJs-Q9s, JTs, J9s, T9s, 98s, 87s, 76s',
    assumptions: CASH6 + ' SB opened 3 bb, BB 3-bets to ≈ 9 bb in position.',
  },

  // ------------------------------------------------------------------------------- 9-max cash
  ...([
    ['UTG', '77+, 66-55:50%, ATs+, A5s-A4s:50%, KTs+, QTs+, JTs, T9s:50%, AJo+, KQo'],
    ['UTG1', '66+, 55:50%, A9s+, A5s-A3s:50%, KTs+, QTs+, JTs, T9s, 98s:50%, AJo+, KQo, KJo:50%'],
    ['UTG2', '55+, 44:50%, A8s+, A5s-A2s, K9s+, Q9s+, J9s+, T9s, 98s:50%, 87s:50%, ATo+, KJo+'],
    ['LJ', RFI6.UTG],
    ['HJ', RFI6.HJ],
    ['CO', RFI6.CO],
    ['BTN', RFI6.BTN],
    ['SB', RFI6.SB],
  ] as const).map(([pos, raise]) => ({
    id: `c9-rfi-${pos.toLowerCase()}`,
    name: `9-max ${pos} open`,
    format: '9max-cash' as const,
    scenario: 'rfi' as const,
    position: pos,
    stackBB: 100,
    raise,
    assumptions: CASH9 + (pos === 'SB' ? ' SB plays raise-or-fold (no limping).' : ''),
  })),
  {
    id: 'c9-bb-vs-utg', name: '9-max BB vs UTG open', format: '9max-cash', scenario: 'vs-open', position: 'BB', vsPosition: 'UTG', stackBB: 100,
    raise: 'KK+, AKs, AKo:50%',
    call: 'QQ-22, AQs-A2s, AKo:50%, AQo, AJo:50%, KQs-K9s, KQo:50%, QJs-Q9s, JTs-J9s, T9s-T8s, 98s-97s, 87s, 76s, 65s, 54s',
    assumptions: CASH9,
  },
  {
    id: 'c9-bb-vs-btn', name: '9-max BB vs BTN open', format: '9max-cash', scenario: 'vs-open', position: 'BB', vsPosition: 'BTN', stackBB: 100,
    raise: BB_VS_BTN.raise, call: BB_VS_BTN.call, assumptions: CASH9,
  },

  // ------------------------------------------------------------------------------- MTT 40 bb
  ...([
    ['UTG', '22+, A2s+, K8s+, Q9s+, J9s+, T9s, 98s:50%, 87s:50%, ATo+, KJo+, QJo:50%'],
    ['UTG1', '22+, A2s+, K7s+, Q9s+, J9s+, T8s+, 98s, 87s:50%, 76s:50%, A9o+, KJo+, QJo:50%'],
    ['LJ', '22+, A2s+, K6s+, Q8s+, J8s+, T8s+, 97s+, 87s, 76s, 65s:50%, A8o+, KTo+, QTo+, JTo:50%'],
    ['HJ', '22+, A2s+, K4s+, Q7s+, J7s+, T7s+, 97s+, 86s+, 76s, 65s, 54s:50%, A7o+, A5o:50%, KTo+, QTo+, JTo'],
    ['CO', '22+, A2s+, K4s+, Q6s+, J7s+, T7s+, 96s+, 86s+, 75s+, 64s+, 54s, A7o+, A5o, K9o+, Q9o+, J9o+, T9o'],
    ['BTN', '22+, A2s+, K2s+, Q2s+, J3s+, T4s+, 95s+, 84s+, 74s+, 63s+, 53s+, 43s, A2o+, K5o+, Q8o+, J8o+, T8o+, 97o+, 87o, 76o:50%'],
    ['SB', '22+, A2s+, K2s+, Q2s+, J4s+, T6s+, 96s+, 85s+, 75s+, 64s+, 54s, A2o+, K7o+, Q9o+, J9o+, T9o, 98o:50%'],
  ] as const).map(([pos, raise]) => ({
    id: `mtt40-rfi-${pos.toLowerCase()}`,
    name: `MTT 40 bb ${pos} open`,
    format: 'mtt' as const,
    scenario: 'rfi' as const,
    position: pos,
    stackBB: 40,
    raise,
    assumptions: MTT40,
  })),
]

const PF =
  'Computed by the engine: heads-up push/fold equilibrium (fictitious play), chip EV, no ICM. ' +
  'SB either shoves or folds; BB calls or folds. Equities from the precomputed preflop matrix ' +
  '(class-averaged, Monte Carlo). Weights show equilibrium frequencies.'

export const PUSH_FOLD_STACKS = [5, 8, 10, 12, 15, 20]
export const PUSH_FOLD_ANTE = 0.125

export const COMPUTED_CHARTS: ComputedChart[] = PUSH_FOLD_STACKS.flatMap((s) => [
  {
    id: `pf-sb-push-${s}`, name: `HU SB shove, ${s} bb`, format: 'mtt' as const, scenario: 'push-fold' as const,
    position: 'SB', vsPosition: 'BB', stackBB: s, ante: PUSH_FOLD_ANTE, side: 'sb-push' as const,
    assumptions: `${PF} Stack ${s} bb, blinds 0.5/1, ante ${PUSH_FOLD_ANTE} bb each.`,
  },
  {
    id: `pf-bb-call-${s}`, name: `HU BB call vs shove, ${s} bb`, format: 'mtt' as const, scenario: 'call-shove' as const,
    position: 'BB', vsPosition: 'SB', stackBB: s, ante: PUSH_FOLD_ANTE, side: 'bb-call' as const,
    assumptions: `${PF} Stack ${s} bb, blinds 0.5/1, ante ${PUSH_FOLD_ANTE} bb each.`,
  },
])
