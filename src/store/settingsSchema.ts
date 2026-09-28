/**
 * App settings: types, defaults and forward-compatible merging.
 * Every top-level key is a "section" that can be reset to defaults independently.
 * Kept free of React so it can be unit-tested.
 */
import { DEFAULT_KEYBINDINGS } from '../hotkeys/actions'

export const SETTINGS_VERSION = 1

export type ThemeMode = 'dark' | 'light' | 'system'
export type DeckStyle = '2color' | '4color'

export interface AppearanceSettings {
  theme: ThemeMode
  deckStyle: DeckStyle
  /** Table felt colour (hex). */
  tableColor: string
  /** Root font scale, 1 = 16px. */
  fontScale: number
  /** Animation duration multiplier: 0 = animations off, 1 = normal, 2 = twice as slow. */
  animationSpeed: number
  /** Compact stat panels (denser padding). */
  compact: boolean
}

export interface DisplaySettings {
  /** Decimals for percentages. */
  percentDecimals: number
  /** Open "show the math" panels by default instead of on demand. */
  showMathByDefault: boolean
  /** Units for chip amounts in the UI. */
  chipUnit: 'bb' | 'chips'
}

export interface EquitySettings {
  /** Monte Carlo trials. */
  iterations: number
  /** Auto mode uses exact enumeration up to this many hand evaluations. */
  maxExactEvaluations: number
  method: 'auto' | 'exact' | 'monte-carlo'
}

export interface RangeSettings {
  /** Weight (0..100 %) applied by the paint brush in grids. */
  paintWeight: number
  /** Opponent range used for the equity heatmap, in range notation. */
  heatmapOpponent: string
  /** Monte Carlo trials per hand class for heatmaps. */
  heatmapIterations: number
  showComboCounts: boolean
}

export interface DrillSettings {
  /** Built-in or custom chart ids to draw questions from (empty = all RFI charts). */
  chartIds: string[]
  /** Only ask hands near the edge of the range (hands adjacent to a different action). */
  borderlineOnly: boolean
  /** Treat mixed-frequency hands as correct for any action with weight >= this %. */
  mixedThreshold: number
  questionCount: number
}

export type QuizTopic =
  | 'pot-odds' | 'required-equity' | 'outs' | 'equity-estimate' | 'call-or-fold'
  | 'combos' | 'blockers' | 'mdf' | 'spr' | 'break-even-fold'

export const QUIZ_TOPICS: { id: QuizTopic; label: string }[] = [
  { id: 'pot-odds', label: 'Pot odds' },
  { id: 'required-equity', label: 'Required equity' },
  { id: 'outs', label: 'Counting outs' },
  { id: 'equity-estimate', label: 'Equity estimate' },
  { id: 'call-or-fold', label: 'Call or fold' },
  { id: 'combos', label: 'Combo counting' },
  { id: 'blockers', label: 'Blocker effects' },
  { id: 'mdf', label: 'MDF & alpha' },
  { id: 'spr', label: 'SPR' },
  { id: 'break-even-fold', label: 'Break-even fold %' },
]

export interface QuizSettings {
  topics: QuizTopic[]
  difficulty: 'easy' | 'medium' | 'hard'
  /** Seconds per question, 0 = no limit. */
  timeLimitSec: number
  /** Accepted absolute error for percentage answers, in percentage points. */
  percentTolerance: number
  /** Accepted relative error for other numeric answers, in %. */
  relativeTolerance: number
  questionCount: number
  spacedRepetition: boolean
}

export interface VarianceSettings {
  winRate: number
  stdDev: number
  hands: number
  bankroll: number
  paths: number
}

export type BotProfileId = 'nit' | 'tag' | 'lag' | 'station' | 'maniac' | 'balanced'

export interface BotProfile {
  id: string
  name: string
  /** % of hands voluntarily played preflop. */
  vpip: number
  /** % of hands raised preflop. */
  pfr: number
  /** % 3-bet when facing an open. */
  threeBet: number
  /** % fold when facing a 3-bet. */
  foldTo3Bet: number
  /** % c-bet as preflop aggressor. */
  cbet: number
  /** % fold facing a c-bet. */
  foldToCbet: number
  /** Aggression factor (bets+raises)/calls postflop. */
  aggression: number
  /** Share of postflop bets that are bluffs (with weak hands), %. */
  bluffFreq: number
}

export interface FreeplaySettings {
  players: number
  stackBB: number
  smallBlind: number
  bigBlind: number
  ante: number
  straddle: boolean
  /** Preflop open size in bb. */
  openSizeBB: number
  /** 3-bet size as multiple of the open. */
  threeBetMultiple: number
  /** Postflop bet presets, % of pot. */
  betPresets: number[]
  /** Raise presets as multiples of the bet faced. */
  raisePresets: number[]
  /** Seat assignment: profile id per bot seat (length players - 1). */
  seatProfiles: string[]
  profiles: BotProfile[]
  /** Delay between bot actions in ms (scaled by nothing else). */
  botDelayMs: number
  autoDeal: boolean
  pauseEveryDecision: boolean
  /** EV loss (bb) above which a decision is flagged in review. */
  mistakeThresholdBB: number
  equityIterations: number
}

export type HudItemId =
  | 'pot' | 'stacks' | 'spr' | 'potOdds' | 'requiredEquity' | 'mdf' | 'equity' | 'ev'
  | 'foldEquity' | 'villainActions' | 'outs' | 'handStrength' | 'rangeAdvantage'

export const HUD_ITEMS: { id: HudItemId; label: string }[] = [
  { id: 'pot', label: 'Pot' },
  { id: 'stacks', label: 'Stacks' },
  { id: 'spr', label: 'SPR' },
  { id: 'potOdds', label: 'Pot odds' },
  { id: 'requiredEquity', label: 'Required equity' },
  { id: 'mdf', label: 'MDF' },
  { id: 'equity', label: 'My equity vs estimate' },
  { id: 'ev', label: 'EV of fold / call / raise' },
  { id: 'foldEquity', label: 'Fold equity' },
  { id: 'villainActions', label: 'Villain action probabilities' },
  { id: 'outs', label: 'Outs & draws' },
  { id: 'handStrength', label: 'Hand strength' },
  { id: 'rangeAdvantage', label: 'Range & nut advantage' },
]

export interface HudSettings {
  items: { id: HudItemId; visible: boolean }[]
}

export interface AppSettings {
  version: number
  appearance: AppearanceSettings
  display: DisplaySettings
  keybindings: Record<string, string>
  equity: EquitySettings
  ranges: RangeSettings
  drill: DrillSettings
  quiz: QuizSettings
  variance: VarianceSettings
  freeplay: FreeplaySettings
  hud: HudSettings
}

export type SettingsSection = Exclude<keyof AppSettings, 'version'>

export const DEFAULT_BOT_PROFILES: BotProfile[] = [
  { id: 'nit', name: 'Nit', vpip: 12, pfr: 10, threeBet: 3, foldTo3Bet: 70, cbet: 55, foldToCbet: 60, aggression: 1.5, bluffFreq: 10 },
  { id: 'tag', name: 'TAG', vpip: 22, pfr: 18, threeBet: 7, foldTo3Bet: 55, cbet: 65, foldToCbet: 45, aggression: 2.5, bluffFreq: 25 },
  { id: 'lag', name: 'LAG', vpip: 30, pfr: 25, threeBet: 11, foldTo3Bet: 45, cbet: 72, foldToCbet: 38, aggression: 3.5, bluffFreq: 35 },
  { id: 'station', name: 'Calling station', vpip: 45, pfr: 6, threeBet: 2, foldTo3Bet: 25, cbet: 35, foldToCbet: 20, aggression: 0.7, bluffFreq: 5 },
  { id: 'maniac', name: 'Maniac', vpip: 60, pfr: 45, threeBet: 20, foldTo3Bet: 25, cbet: 85, foldToCbet: 25, aggression: 5, bluffFreq: 55 },
  { id: 'balanced', name: 'Balanced baseline', vpip: 24, pfr: 19, threeBet: 8, foldTo3Bet: 50, cbet: 60, foldToCbet: 42, aggression: 2.5, bluffFreq: 30 },
]

export const DEFAULT_SETTINGS: AppSettings = {
  version: SETTINGS_VERSION,
  appearance: {
    theme: 'dark',
    deckStyle: '4color',
    tableColor: '#1d5b43',
    fontScale: 1,
    animationSpeed: 1,
    compact: false,
  },
  display: { percentDecimals: 1, showMathByDefault: false, chipUnit: 'bb' },
  keybindings: { ...DEFAULT_KEYBINDINGS },
  equity: { iterations: 200_000, maxExactEvaluations: 30_000_000, method: 'auto' },
  ranges: { paintWeight: 100, heatmapOpponent: 'any', heatmapIterations: 4000, showComboCounts: false },
  drill: { chartIds: [], borderlineOnly: false, mixedThreshold: 25, questionCount: 20 },
  quiz: {
    topics: QUIZ_TOPICS.map((t) => t.id),
    difficulty: 'medium',
    timeLimitSec: 0,
    percentTolerance: 2,
    relativeTolerance: 5,
    questionCount: 10,
    spacedRepetition: true,
  },
  variance: { winRate: 5, stdDev: 90, hands: 100_000, bankroll: 3000, paths: 100 },
  freeplay: {
    players: 6,
    stackBB: 100,
    smallBlind: 0.5,
    bigBlind: 1,
    ante: 0,
    straddle: false,
    openSizeBB: 2.5,
    threeBetMultiple: 3.5,
    betPresets: [33, 50, 75, 100],
    raisePresets: [2.5, 3, 4],
    seatProfiles: ['tag', 'station', 'lag', 'nit', 'balanced', 'maniac', 'tag', 'station'],
    profiles: DEFAULT_BOT_PROFILES,
    botDelayMs: 500,
    autoDeal: false,
    pauseEveryDecision: false,
    mistakeThresholdBB: 1,
    equityIterations: 20_000,
  },
  hud: { items: HUD_ITEMS.map((h) => ({ id: h.id, visible: true })) },
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Deep-merge stored values over defaults: unknown keys are dropped, missing keys get defaults,
 * values of the wrong type fall back to the default. Arrays are taken from `stored` when they are arrays.
 * This makes old saved settings load safely after new options are added.
 */
export function mergeWithDefaults<T>(defaults: T, stored: unknown): T {
  if (isPlainObject(defaults)) {
    if (!isPlainObject(stored)) return structuredClone(defaults)
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(defaults)) {
      out[key] = mergeWithDefaults((defaults as Record<string, unknown>)[key], stored[key])
    }
    return out as T
  }
  if (Array.isArray(defaults)) return (Array.isArray(stored) ? structuredClone(stored) : structuredClone(defaults)) as T
  if (typeof stored === typeof defaults && stored !== null && !(typeof stored === 'number' && !Number.isFinite(stored))) {
    return stored as T
  }
  return defaults
}

/** Keybindings keep user overrides but always contain every known action. */
function mergeKeybindings(stored: unknown): Record<string, string> {
  const out = { ...DEFAULT_KEYBINDINGS }
  if (isPlainObject(stored)) {
    for (const [k, v] of Object.entries(stored)) if (k in out && typeof v === 'string') out[k] = v
  }
  return out
}

/** HUD items: keep stored order/visibility, drop unknown ids, append new ones. */
function mergeHud(stored: unknown): HudSettings {
  const known = new Set(HUD_ITEMS.map((h) => h.id))
  const items: HudSettings['items'] = []
  const seen = new Set<string>()
  if (isPlainObject(stored) && Array.isArray(stored.items)) {
    for (const it of stored.items) {
      if (isPlainObject(it) && typeof it.id === 'string' && known.has(it.id as HudItemId) && !seen.has(it.id)) {
        items.push({ id: it.id as HudItemId, visible: it.visible !== false })
        seen.add(it.id)
      }
    }
  }
  for (const h of HUD_ITEMS) if (!seen.has(h.id)) items.push({ id: h.id, visible: true })
  return { items }
}

export function normalizeSettings(stored: unknown): AppSettings {
  const merged = mergeWithDefaults(DEFAULT_SETTINGS, stored)
  const s = isPlainObject(stored) ? stored : {}
  merged.keybindings = mergeKeybindings(s.keybindings)
  merged.hud = mergeHud(s.hud)
  const template: BotProfile = { ...DEFAULT_BOT_PROFILES[5] }
  merged.freeplay.profiles = merged.freeplay.profiles
    .filter((p) => isPlainObject(p) && typeof p.id === 'string')
    .map((p) => mergeWithDefaults(template, p))
  if (merged.freeplay.profiles.length === 0) merged.freeplay.profiles = structuredClone(DEFAULT_BOT_PROFILES)
  merged.version = SETTINGS_VERSION
  return merged
}
