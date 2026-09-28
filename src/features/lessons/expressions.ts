/**
 * Inline lesson expressions: `{{ fn args… key=value… }}` inside lesson Markdown.
 * Every number a lesson shows is produced here by the engine, never typed by hand.
 *
 *   {{formula requiredEquity pot=150 call=50}}        any formula from engine/formulas.ts (fmt=pct|ratio|num|int|bb)
 *   {{equity AhKh vs 7s7d board=7h8h2c}}             exact/auto equity of player 1 (player=2 for another seat)
 *   {{equity AKs vs QQ}}                              class vs class preflop: precomputed matrix
 *   {{equity "TT+, AK" vs "22+" }}                    ranges (quotes when the notation has spaces)
 *   {{combos "TT+, AK" dead=AhKd}}                    weighted combo count after card removal
 *   {{rangepct "22+, A2s+"}}                          % of all 1326 starting hands
 *   {{outs AhKh board=7h8h2c villain=7s7d field=clean}}  clean | dirty | effective | total
 *   {{hand AhKh board=AdKs7c}}                        text: best hand description
 *   {{binom 52 2}}                                    C(n, k)
 *   {{vsrandom AA}}                                   class equity vs a random hand (matrix)
 *   {{frac 5108 binom:52:5}}                          a / b (terms: numbers or binom:n:k), default fmt pct
 *   {{foldprob "TT+, AK, KQs" continue="TT+, AK" dead=…}}  fold probability of a range
 *   {{assume 45%}}                                    an example assumption (shown, labelled as such)
 *   players may be chart:ID[:layer] (library charts), e.g. {{equity chart:c6-rfi-btn vs chart:c6-bb-vs-btn:played board=Ks7d2c}}
 *   {{chartpct c6-rfi-btn}}                           % of hands in a library chart layer (layer=raise|call|played)
 * A formula input may be an engine equity: equity=eq:AhKh,7s7d,7h8h2c (hero, villain, optional board).
 * Common keys: fmt=pct|pct0|pct1|pct2|ratio|num|num0|num1|int|bb, player=N.
 */
import { FORMULAS, binomial, fmt as fmtNum, type Explanation } from '../../engine/formulas'
import { parseCards, type Card } from '../../engine/cards'
import { comboCount, parseRange, rangePercent, liveCombos, foldProbabilityFromRange } from '../../engine/range'
import { handClassByLabel, comboIndex } from '../../engine/combos'
import { classVsClass, EQUITY_VS_RANDOM, MATRIX_INFO } from '../../engine/preflop'
import { analyzeOuts } from '../../engine/outs'
import { evaluate, describeScore } from '../../engine/evaluator'
import type { EquityRequest, EquityResult } from '../../engine/equity'
import { BASELINE_CHARTS } from '../../data/ranges/library'

export interface ParsedExpr {
  fn: string
  args: string[]
  kv: Record<string, string>
  source: string
}

export interface ExprValue {
  /** Numeric value (NaN for text results). */
  value: number
  display: string
  explanation?: Explanation
  note?: string
}

export type EquityRunner = (req: EquityRequest) => Promise<EquityResult>

export const EXPR_RE = /\{\{([^{}]+)\}\}/g

export function parseExpr(source: string): ParsedExpr {
  const src = source.trim()
  // Support key="a b, c" by pre-joining.
  const tokens: string[] = []
  const re = /([a-zA-Z]+)="([^"]*)"|"([^"]*)"|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    if (m[1]) tokens.push(`${m[1]}=${m[2]}`)
    else if (m[3] !== undefined) tokens.push(`\u0000${m[3]}`) // quoted positional arg
    else tokens.push(m[4])
  }
  const [fn, ...rest] = tokens
  if (!fn) throw new Error('Empty expression')
  const args: string[] = []
  const kv: Record<string, string> = {}
  for (const t of rest) {
    if (t.startsWith('\u0000')) { args.push(t.slice(1)); continue }
    const eq = t.indexOf('=')
    if (eq > 0) kv[t.slice(0, eq)] = t.slice(eq + 1)
    else args.push(t)
  }
  return { fn, args, kv, source: src }
}

const FORMULA_FMT: Record<string, string> = {
  potOddsRatio: 'ratio', spr: 'num1', pairCombos: 'int', unpairedCombos: 'int', totalStartingHands: 'int',
  evCall: 'bb', evFold: 'bb', evBet: 'bb', foldEquityValue: 'bb', impliedOddsNeeded: 'bb', evWithImpliedOdds: 'bb',
  expectedWinnings: 'bb', resultStdDev: 'bb', handsToConfidence: 'int',
}

export function formatValue(v: number, f = 'pct'): string {
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '–'
  switch (f) {
    case 'pct0': return `${(v * 100).toFixed(0)}%`
    case 'pct': case 'pct1': return `${(v * 100).toFixed(1)}%`
    case 'pct2': return `${(v * 100).toFixed(2)}%`
    case 'ratio': return `${fmtNum(v, 2)} : 1`
    case 'int': return Math.round(v).toLocaleString('en-US')
    case 'num0': return v.toFixed(0)
    case 'num1': return fmtNum(v, 1)
    case 'num': return fmtNum(v, 2)
    case 'bb': return `${fmtNum(v, 2)} bb`
    default: throw new Error(`Unknown fmt "${f}"`)
  }
}

const isClass = (s: string) => !!handClassByLabel(s) && /^[2-9TJQKA]{2}[so]?$/i.test(s)
const isHand = (s: string) => /^([2-9TJQKA][cdhs]){2}$/i.test(s)

function playerCombos(s: string) {
  if (s.startsWith('chart:')) {
    // chart:ID[:layer] from the built-in library (layer raise | call | played)
    const [, id, layer = 'raise'] = s.split(':')
    const c = BASELINE_CHARTS.find((x) => x.id === id)
    if (!c) throw new Error(`Unknown chart ${id}`)
    const raise = parseRange(c.raise), call = c.call ? parseRange(c.call) : parseRange('')
    const w = layer === 'call' ? call : layer === 'played' ? raise.map((x, i) => Math.min(1, x + call[i])) : raise
    return { combos: liveCombos(w) }
  }
  if (isHand(s)) {
    const [a, b] = parseCards(s)
    return { combos: [{ combo: comboIndex(a, b), weight: 1 }] }
  }
  return { combos: liveCombos(parseRange(s)) }
}

function num(kv: Record<string, string>, k: string): number {
  const raw = kv[k] ?? ''
  const frac = raw.match(/^(-?[\d.]+)\/([\d.]+)$/)
  const v = frac ? Number(frac[1]) / Number(frac[2]) : Number(raw)
  if (!Number.isFinite(v)) throw new Error(`Missing or invalid ${k}=`)
  return v
}

export async function evaluateExpr(e: ParsedExpr, runEquity: EquityRunner): Promise<ExprValue> {
  const f = e.kv.fmt
  switch (e.fn) {
    case 'formula': {
      const id = e.args[0]
      const def = (FORMULAS as Record<string, (typeof FORMULAS)[keyof typeof FORMULAS]>)[id]
      if (!def) throw new Error(`Unknown formula "${id}"`)
      const input: Record<string, number> = {}
      for (const k of Object.keys(def.variables)) {
        const raw = e.kv[k]
        if (raw?.startsWith('eq:')) {
          // equity=eq:HERO,VILLAIN[,BOARD] → exact/auto equity of HERO computed by the engine
          const [h, v, b] = raw.slice(3).split(',')
          const r = await runEquity({ players: [playerCombos(h), playerCombos(v)], board: b ? parseCards(b) : [], method: 'auto', iterations: 400_000, seed: 1 })
          input[k] = r.players[0].equity
        } else input[k] = num(e.kv, k)
      }
      const explanation = (def as unknown as { explain: (i: Record<string, number>) => Explanation }).explain(input)
      return { value: explanation.value, display: formatValue(explanation.value, f ?? FORMULA_FMT[id] ?? 'pct'), explanation }
    }
    case 'equity': {
      const parts = e.args.join(' ').split(/\s+vs\s+/i).map((s) => s.trim()).filter(Boolean)
      if (parts.length < 2) throw new Error('equity needs "A vs B"')
      const board = e.kv.board ? parseCards(e.kv.board) : []
      const dead = e.kv.dead ? parseCards(e.kv.dead) : []
      const player = (Number(e.kv.player) || 1) - 1
      if (parts.length === 2 && board.length === 0 && dead.length === 0 && isClass(parts[0]) && isClass(parts[1])) {
        const a = handClassByLabel(parts[0])!, b = handClassByLabel(parts[1])!
        const v = player === 0 ? classVsClass(a.index, b.index) : classVsClass(b.index, a.index)
        return { value: v, display: formatValue(v, f ?? 'pct1'), note: `Preflop matrix (Monte Carlo, ${MATRIX_INFO.trialsPerPair.toLocaleString()} trials per pair, SE ≤ ${(MATRIX_INFO.maxStdError * 100).toFixed(2)} pp), averaged over suit combinations.` }
      }
      const r = await runEquity({ players: parts.map(playerCombos), board, dead, method: 'auto', iterations: 400_000, seed: 1 })
      const p = r.players[player]
      const note = r.method === 'exact'
        ? `Exact enumeration of ${r.samples.toLocaleString()} outcomes (win ${formatValue(p.win, 'pct2')}, tie ${formatValue(p.tie, 'pct2')}).`
        : `Monte Carlo, ${r.samples.toLocaleString()} trials, ± ${formatValue(p.marginOfError95, 'pct2')} (95 %).`
      return { value: p.equity, display: (r.method === 'exact' ? '' : '≈ ') + formatValue(p.equity, f ?? 'pct1'), note }
    }
    case 'combos': {
      const dead = e.kv.dead ? parseCards(e.kv.dead) : []
      const v = comboCount(parseRange(e.args.join(' ')), dead)
      return { value: v, display: formatValue(v, f ?? 'num'), note: dead.length ? `Card removal: ${e.kv.dead}` : undefined }
    }
    case 'rangepct': {
      const v = rangePercent(parseRange(e.args.join(' ')))
      return { value: v, display: formatValue(v, f ?? 'pct1'), note: 'Weighted combos / 1326' }
    }
    case 'outs': {
      const hero = parseCards(e.args[0]) as [Card, Card]
      const board = parseCards(e.kv.board ?? '')
      const villain = e.kv.villain ? playerCombos(e.kv.villain).combos : undefined
      const r = analyzeOuts({ hero, board, villain })
      const field = e.kv.field ?? 'total'
      const v = field === 'clean' ? r.cleanOuts : field === 'dirty' ? r.dirtyOuts : field === 'effective' ? r.effectiveOuts : r.cleanOuts + r.dirtyOuts
      return { value: v, display: formatValue(v, f ?? (field === 'effective' ? 'num1' : 'int')), note: `${r.mode === 'vs-villain' ? 'Against ' + e.kv.villain : 'Improvement outs'}: ${r.cards.filter((c) => c.status !== 'none').map((c) => c.label).join(' ')}` }
    }
    case 'hand': {
      const cards = parseCards(e.args[0] + (e.kv.board ?? ''))
      return { value: NaN, display: describeScore(evaluate(cards)) }
    }
    case 'binom': {
      const v = binomial(Number(e.args[0]), Number(e.args[1]))
      return { value: v, display: formatValue(v, f ?? 'int'), note: `C(${e.args[0]}, ${e.args[1]})` }
    }
    case 'vsrandom': {
      const cls = handClassByLabel(e.args[0])
      if (!cls) throw new Error(`Unknown hand class ${e.args[0]}`)
      const v = EQUITY_VS_RANDOM[cls.index]
      return { value: v, display: formatValue(v, f ?? 'pct1'), note: 'All-in preflop vs a uniformly random hand (preflop matrix).' }
    }
    case 'foldprob': {
      const range = parseRange(e.args.join(' '))
      const cont = parseRange(e.kv.continue ?? '')
      const dead = e.kv.dead ? parseCards(e.kv.dead) : []
      const v = foldProbabilityFromRange(range, cont, dead)
      return { value: v, display: formatValue(v, f ?? 'pct1'), note: `P(fold) = 1 − continuing combos / all combos = 1 − ${fmtNum(comboCount(cont.map((w, i) => Math.min(w, range[i])), dead), 2)} / ${fmtNum(comboCount(range, dead), 2)}` }
    }
    case 'assume': {
      // A value chosen for an example (e.g. "villain folds 45 %"): shown, but labelled as an assumption.
      const t = e.args[0] ?? ''
      const v = t.endsWith('%') ? Number(t.slice(0, -1)) / 100 : Number(t)
      if (!Number.isFinite(v)) throw new Error(`Bad assumption ${t}`)
      return { value: v, display: t.endsWith('%') ? `${t.slice(0, -1)}%` : t, note: 'An assumption chosen for this example, not a computed fact.' }
    }
    case 'frac': {
      const term = (t: string) => {
        const b = t.match(/^binom:(\d+):(\d+)$/)
        const v = b ? binomial(Number(b[1]), Number(b[2])) : Number(t)
        if (!Number.isFinite(v)) throw new Error(`Bad term ${t}`)
        return v
      }
      const a = term(e.args[0]), b = term(e.args[1])
      return { value: a / b, display: formatValue(a / b, f ?? 'pct2'), note: `${a.toLocaleString('en-US')} / ${b.toLocaleString('en-US')}` }
    }
    case 'chartpct': {
      const c = BASELINE_CHARTS.find((x) => x.id === e.args[0])
      if (!c) throw new Error(`Unknown chart ${e.args[0]}`)
      const layer = e.kv.layer ?? 'raise'
      const raise = parseRange(c.raise), call = c.call ? parseRange(c.call) : parseRange('')
      const w = layer === 'call' ? call : layer === 'played' ? raise.map((x, i) => Math.min(1, x + call[i])) : raise
      const v = rangePercent(w)
      return { value: v, display: formatValue(v, f ?? 'pct0'), note: `${c.name} (${layer}), approximate baseline chart: ${c.assumptions}` }
    }
    default:
      throw new Error(`Unknown expression "${e.fn}"`)
  }
}
