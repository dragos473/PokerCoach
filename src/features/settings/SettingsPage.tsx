/**
 * Central settings page. Every option lives here; each section has "Reset to default".
 */
import { useRef, useState, type ReactNode } from 'react'
import { useSettings } from '../../store/settings'
import {
  QUIZ_TOPICS, HUD_ITEMS, DEFAULT_BOT_PROFILES, type SettingsSection, type BotProfile, type QuizTopic,
} from '../../store/settingsSchema'
import { Button, Field, NumberInput, PageHeader, Segmented, Select, Slider, Toggle, TextInput, Kbd, ErrorNote } from '../../components/ui'
import { cx } from '../../lib/cx'
import { PlayingCard } from '../../components/PlayingCard'
import { parseCards } from '../../engine/cards'
import { HOTKEY_ACTIONS, SCOPE_LABELS, eventToKey, findConflicts, type HotkeyScope } from '../../hotkeys/actions'
import { exportAll, importAll, validateBackup, downloadFile, clearAll, BackupError } from '../../db/backup'
import { parseRange, RangeParseError } from '../../engine/range'
import { uid } from '../../lib/format'

const SECTIONS: { id: SettingsSection | 'data'; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'display', label: 'Numbers & math' },
  { id: 'equity', label: 'Equity engine' },
  { id: 'ranges', label: 'Range grid' },
  { id: 'drill', label: 'Range drill' },
  { id: 'quiz', label: 'Quizzer' },
  { id: 'variance', label: 'Variance simulator' },
  { id: 'freeplay', label: 'Freeplay table' },
  { id: 'hud', label: 'Freeplay HUD' },
  { id: 'keybindings', label: 'Keyboard' },
  { id: 'data', label: 'Data' },
]

function Section({ id, title, children, reset }: { id: string; title: string; children: ReactNode; reset?: () => void }) {
  return (
    <section id={`s-${id}`} className="scroll-mt-20 rounded-lg border border-line bg-surface">
      <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {reset && <Button size="sm" variant="ghost" onClick={reset}>Reset to default</Button>}
      </header>
      <div className="divide-y divide-line px-4">{children}</div>
    </section>
  )
}

const TABLE_PRESETS = [
  { label: 'Green', value: '#1d5b43' },
  { label: 'Blue', value: '#1c4a6b' },
  { label: 'Graphite', value: '#2c313b' },
  { label: 'Burgundy', value: '#5a2130' },
  { label: 'Teal', value: '#135e5e' },
]

export function SettingsPage() {
  const { settings, update, resetSection, resetAll } = useSettings()
  const s = settings

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Everything is stored locally in this browser. Changes save automatically."
        actions={<Button variant="danger" size="sm" onClick={() => confirm('Reset every setting to its default?') && resetAll()}>Reset all settings</Button>}
      />
      <div className="flex gap-8">
        <nav className="sticky top-8 hidden h-fit w-44 shrink-0 flex-col gap-0.5 lg:flex">
          {SECTIONS.map((sec) => (
            <a key={sec.id} href={`#/settings`} onClick={(e) => { e.preventDefault(); document.getElementById(`s-${sec.id}`)?.scrollIntoView({ behavior: 'smooth' }) }}
              className="rounded px-2 py-1 text-sm text-muted hover:text-fg">{sec.label}</a>
          ))}
        </nav>
        <div className="min-w-0 flex-1 space-y-5">
          <Section id="appearance" title="Appearance" reset={() => resetSection('appearance')}>
            <Field label="Theme">
              <Segmented value={s.appearance.theme} onChange={(theme) => update('appearance', { theme })}
                options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }]} />
            </Field>
            <Field label="Card deck" hint="4-colour: ♠ black, ♥ red, ♦ blue, ♣ green">
              <div className="flex items-center gap-3">
                <Segmented value={s.appearance.deckStyle} onChange={(deckStyle) => update('appearance', { deckStyle })}
                  options={[{ value: '2color', label: '2-colour' }, { value: '4color', label: '4-colour' }]} />
                <div className="flex gap-1">{parseCards('AsKhQdJc').map((c) => <PlayingCard key={c} card={c} size="sm" />)}</div>
              </div>
            </Field>
            <Field label="Table colour">
              <div className="flex items-center gap-2">
                {TABLE_PRESETS.map((p) => (
                  <button key={p.value} title={p.label} onClick={() => update('appearance', { tableColor: p.value })}
                    className={cx('h-7 w-7 rounded-full border-2', s.appearance.tableColor === p.value ? 'border-fg' : 'border-transparent')}
                    style={{ background: p.value }} />
                ))}
                <input type="color" value={s.appearance.tableColor} onChange={(e) => update('appearance', { tableColor: e.target.value })}
                  className="h-7 w-9 cursor-pointer rounded border border-line bg-transparent" aria-label="Custom table colour" />
              </div>
            </Field>
            <Field label="Font size">
              <Slider value={s.appearance.fontScale} min={0.8} max={1.4} step={0.05} onChange={(fontScale) => update('appearance', { fontScale })} format={(v) => `${Math.round(v * 100)}%`} label="Font size" />
            </Field>
            <Field label="Animation speed" hint="Duration multiplier. 0 turns animations off.">
              <Slider value={s.appearance.animationSpeed} min={0} max={2.5} step={0.25} onChange={(animationSpeed) => update('appearance', { animationSpeed })} format={(v) => (v === 0 ? 'off' : `×${v}`)} label="Animation speed" />
            </Field>
            <Field label="Compact stat panels">
              <Toggle checked={s.appearance.compact} onChange={(compact) => update('appearance', { compact })} />
            </Field>
          </Section>

          <Section id="display" title="Numbers & math" reset={() => resetSection('display')}>
            <Field label="Percentage decimals">
              <Segmented value={String(s.display.percentDecimals)} onChange={(v) => update('display', { percentDecimals: Number(v) })}
                options={['0', '1', '2', '3'].map((v) => ({ value: v, label: v }))} />
            </Field>
            <Field label="Expand “show the math” by default">
              <Toggle checked={s.display.showMathByDefault} onChange={(showMathByDefault) => update('display', { showMathByDefault })} />
            </Field>
          </Section>

          <Section id="equity" title="Equity engine" reset={() => resetSection('equity')}>
            <Field label="Default method" hint="Auto: exact enumeration when affordable, otherwise Monte Carlo.">
              <Segmented value={s.equity.method} onChange={(method) => update('equity', { method })}
                options={[{ value: 'auto', label: 'Auto' }, { value: 'exact', label: 'Exact' }, { value: 'monte-carlo', label: 'Monte Carlo' }]} />
            </Field>
            <Field label="Monte Carlo trials" hint="Margin of error shrinks with 1/√trials.">
              <NumberInput value={s.equity.iterations} min={1000} max={20_000_000} step={10_000} onChange={(iterations) => update('equity', { iterations })} className="w-32" />
            </Field>
            <Field label="Exact enumeration limit" hint="Auto switches to Monte Carlo above this many hand evaluations.">
              <NumberInput value={s.equity.maxExactEvaluations} min={100_000} max={2_000_000_000} step={1_000_000} onChange={(maxExactEvaluations) => update('equity', { maxExactEvaluations })} className="w-36" />
            </Field>
          </Section>

          <Section id="ranges" title="Range grid" reset={() => resetSection('ranges')}>
            <Field label="Default paint weight">
              <Slider value={s.ranges.paintWeight} min={0} max={100} step={5} onChange={(paintWeight) => update('ranges', { paintWeight })} format={(v) => `${v}%`} label="Paint weight" />
            </Field>
            <Field label="Heatmap opponent range" hint="Range notation used for the per-hand equity heatmap.">
              <RangeTextSetting value={s.ranges.heatmapOpponent} onChange={(heatmapOpponent) => update('ranges', { heatmapOpponent })} />
            </Field>
            <Field label="Heatmap trials per hand class">
              <NumberInput value={s.ranges.heatmapIterations} min={500} max={100_000} step={500} onChange={(heatmapIterations) => update('ranges', { heatmapIterations })} />
            </Field>
            <Field label="Show combo counts in cells">
              <Toggle checked={s.ranges.showComboCounts} onChange={(showComboCounts) => update('ranges', { showComboCounts })} />
            </Field>
          </Section>

          <Section id="drill" title="Range drill" reset={() => resetSection('drill')}>
            <Field label="Questions per drill"><NumberInput value={s.drill.questionCount} min={5} max={500} onChange={(questionCount) => update('drill', { questionCount })} /></Field>
            <Field label="Borderline hands only" hint="Only ask hands next to a different action in the chart.">
              <Toggle checked={s.drill.borderlineOnly} onChange={(borderlineOnly) => update('drill', { borderlineOnly })} />
            </Field>
            <Field label="Mixed-strategy threshold" hint="For mixed hands, any action played at least this often counts as correct.">
              <Slider value={s.drill.mixedThreshold} min={5} max={50} step={5} onChange={(mixedThreshold) => update('drill', { mixedThreshold })} format={(v) => `${v}%`} label="Mixed threshold" />
            </Field>
          </Section>

          <Section id="quiz" title="Quizzer" reset={() => resetSection('quiz')}>
            <Field label="Topics">
              <div className="flex max-w-md flex-wrap justify-end gap-1.5">
                {QUIZ_TOPICS.map((t) => {
                  const on = s.quiz.topics.includes(t.id)
                  return (
                    <button key={t.id} onClick={() => {
                      const topics: QuizTopic[] = on ? s.quiz.topics.filter((x) => x !== t.id) : [...s.quiz.topics, t.id]
                      if (topics.length) update('quiz', { topics })
                    }} className={cx('rounded-full border px-2.5 py-1 text-xs transition-ui', on ? 'border-accent bg-accent/15 text-fg' : 'border-line text-muted')}>
                      {t.label}
                    </button>
                  )
                })}
              </div>
            </Field>
            <Field label="Difficulty">
              <Segmented value={s.quiz.difficulty} onChange={(difficulty) => update('quiz', { difficulty })}
                options={[{ value: 'easy', label: 'Easy' }, { value: 'medium', label: 'Medium' }, { value: 'hard', label: 'Hard' }]} />
            </Field>
            <Field label="Time limit per question" hint="0 = no limit"><NumberInput value={s.quiz.timeLimitSec} min={0} max={600} onChange={(timeLimitSec) => update('quiz', { timeLimitSec })} suffix="s" /></Field>
            <Field label="Tolerance for % answers" hint="Absolute, in percentage points"><NumberInput value={s.quiz.percentTolerance} min={0} max={20} step={0.5} onChange={(percentTolerance) => update('quiz', { percentTolerance })} suffix="pp" /></Field>
            <Field label="Tolerance for other numbers" hint="Relative error"><NumberInput value={s.quiz.relativeTolerance} min={0} max={50} step={1} onChange={(relativeTolerance) => update('quiz', { relativeTolerance })} suffix="%" /></Field>
            <Field label="Questions per session"><NumberInput value={s.quiz.questionCount} min={1} max={200} onChange={(questionCount) => update('quiz', { questionCount })} /></Field>
            <Field label="Spaced repetition of missed questions"><Toggle checked={s.quiz.spacedRepetition} onChange={(spacedRepetition) => update('quiz', { spacedRepetition })} /></Field>
          </Section>

          <Section id="variance" title="Variance simulator defaults" reset={() => resetSection('variance')}>
            <Field label="Win rate"><NumberInput value={s.variance.winRate} min={-50} max={50} step={0.5} onChange={(winRate) => update('variance', { winRate })} suffix="bb/100" /></Field>
            <Field label="Standard deviation"><NumberInput value={s.variance.stdDev} min={1} max={400} onChange={(stdDev) => update('variance', { stdDev })} suffix="bb/100" /></Field>
            <Field label="Hands"><NumberInput value={s.variance.hands} min={100} max={10_000_000} step={1000} onChange={(hands) => update('variance', { hands })} className="w-32" /></Field>
            <Field label="Bankroll"><NumberInput value={s.variance.bankroll} min={1} max={1_000_000} step={100} onChange={(bankroll) => update('variance', { bankroll })} suffix="bb" /></Field>
            <Field label="Sample paths"><NumberInput value={s.variance.paths} min={1} max={2000} onChange={(paths) => update('variance', { paths })} /></Field>
          </Section>

          <FreeplaySettingsSection />
          <HudSettingsSection />
          <KeybindingsSection />
          <DataSection />
        </div>
      </div>
    </div>
  )
}

function RangeTextSetting({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  const [err, setErr] = useState('')
  const commit = () => {
    try {
      parseRange(draft)
      setErr('')
      onChange(draft)
    } catch (e) {
      setErr(e instanceof RangeParseError ? e.message : 'Invalid range')
    }
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <TextInput value={draft} onChange={setDraft} mono className="w-56" onEnter={commit} invalid={!!err} />
        <Button size="md" onClick={commit}>Apply</Button>
      </div>
      {err && <span className="text-xs text-bad">{err}</span>}
    </div>
  )
}

function FreeplaySettingsSection() {
  const { settings, update, resetSection } = useSettings()
  const f = settings.freeplay
  const setProfile = (id: string, patch: Partial<BotProfile>) =>
    update('freeplay', { profiles: f.profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
  const numberFields: { key: keyof BotProfile; label: string; max: number; step?: number }[] = [
    { key: 'vpip', label: 'VPIP %', max: 100 },
    { key: 'pfr', label: 'PFR %', max: 100 },
    { key: 'threeBet', label: '3-bet %', max: 100 },
    { key: 'foldTo3Bet', label: 'Fold to 3-bet %', max: 100 },
    { key: 'cbet', label: 'C-bet %', max: 100 },
    { key: 'foldToCbet', label: 'Fold to c-bet %', max: 100 },
    { key: 'aggression', label: 'AF', max: 10, step: 0.1 },
    { key: 'bluffFreq', label: 'Bluff %', max: 100 },
  ]
  return (
    <Section id="freeplay" title="Freeplay table" reset={() => resetSection('freeplay')}>
      <Field label="Players at the table"><NumberInput value={f.players} min={2} max={9} onChange={(players) => update('freeplay', { players })} /></Field>
      <Field label="Starting stacks"><NumberInput value={f.stackBB} min={5} max={1000} onChange={(stackBB) => update('freeplay', { stackBB })} suffix="bb" /></Field>
      <Field label="Blinds" hint="In big blinds (big blind is the unit).">
        <div className="flex gap-2">
          <NumberInput value={f.smallBlind} min={0.1} max={1} step={0.1} onChange={(smallBlind) => update('freeplay', { smallBlind })} suffix="SB" />
        </div>
      </Field>
      <Field label="Ante (per player)"><NumberInput value={f.ante} min={0} max={1} step={0.05} onChange={(ante) => update('freeplay', { ante })} suffix="bb" /></Field>
      <Field label="Straddle (UTG posts 2 bb)"><Toggle checked={f.straddle} onChange={(straddle) => update('freeplay', { straddle })} /></Field>
      <Field label="Open size"><NumberInput value={f.openSizeBB} min={2} max={6} step={0.25} onChange={(openSizeBB) => update('freeplay', { openSizeBB })} suffix="bb" /></Field>
      <Field label="3-bet size"><NumberInput value={f.threeBetMultiple} min={2} max={6} step={0.25} onChange={(threeBetMultiple) => update('freeplay', { threeBetMultiple })} suffix="× open" /></Field>
      <Field label="Bet sizing presets" hint="% of pot, comma separated">
        <ListNumberSetting values={f.betPresets} onChange={(betPresets) => update('freeplay', { betPresets })} />
      </Field>
      <Field label="Raise sizing presets" hint="× the bet faced, comma separated">
        <ListNumberSetting values={f.raisePresets} onChange={(raisePresets) => update('freeplay', { raisePresets })} />
      </Field>
      <Field label="Bot action delay"><NumberInput value={f.botDelayMs} min={0} max={5000} step={100} onChange={(botDelayMs) => update('freeplay', { botDelayMs })} suffix="ms" /></Field>
      <Field label="Auto-deal next hand"><Toggle checked={f.autoDeal} onChange={(autoDeal) => update('freeplay', { autoDeal })} /></Field>
      <Field label="Pause at every decision" hint="Step mode: every bot action waits until you press Next (Space)."><Toggle checked={f.pauseEveryDecision} onChange={(pauseEveryDecision) => update('freeplay', { pauseEveryDecision })} /></Field>
      <Field label="Flag decisions losing more than"><NumberInput value={f.mistakeThresholdBB} min={0} max={50} step={0.25} onChange={(mistakeThresholdBB) => update('freeplay', { mistakeThresholdBB })} suffix="bb EV" /></Field>
      <Field label="Live equity trials (HUD)"><NumberInput value={f.equityIterations} min={1000} max={500_000} step={1000} onChange={(equityIterations) => update('freeplay', { equityIterations })} /></Field>
      <Field label="Seat profiles" hint="Bot profile for each seat, clockwise from your left.">
        <div className="flex max-w-md flex-wrap justify-end gap-1.5">
          {Array.from({ length: f.players - 1 }, (_, i) => (
            <Select key={i} value={f.seatProfiles[i] ?? 'balanced'}
              onChange={(v) => { const next = [...f.seatProfiles]; next[i] = v; update('freeplay', { seatProfiles: next }) }}
              options={f.profiles.map((p) => ({ value: p.id, label: `${i + 1}: ${p.name}` }))} className="h-8 text-xs" />
          ))}
        </div>
      </Field>
      <div className="py-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm">Bot profiles</p>
          <Button size="sm" onClick={() => update('freeplay', { profiles: [...f.profiles, { ...DEFAULT_BOT_PROFILES[5], id: uid(), name: 'Custom' }] })}>+ New profile</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-muted">
              <tr><th className="py-1 pr-2 font-normal">Name</th>{numberFields.map((n) => <th key={n.key} className="px-1 py-1 font-normal">{n.label}</th>)}<th /></tr>
            </thead>
            <tbody>
              {f.profiles.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="py-1 pr-2"><TextInput value={p.name} onChange={(name) => setProfile(p.id, { name })} className="h-8 w-32" /></td>
                  {numberFields.map((n) => (
                    <td key={n.key} className="px-1 py-1">
                      <NumberInput value={p[n.key] as number} min={0} max={n.max} step={n.step ?? 1} className="h-8 w-16 px-1.5 text-xs" onChange={(v) => setProfile(p.id, { [n.key]: v })} />
                    </td>
                  ))}
                  <td className="py-1 pl-1">
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" title="Duplicate" onClick={() => update('freeplay', { profiles: [...f.profiles, { ...p, id: uid(), name: p.name + ' copy' }] })}>⧉</Button>
                      <Button size="sm" variant="ghost" title="Delete" disabled={f.profiles.length <= 1}
                        onClick={() => update('freeplay', { profiles: f.profiles.filter((x) => x.id !== p.id), seatProfiles: f.seatProfiles.map((sp) => (sp === p.id ? f.profiles.find((x) => x.id !== p.id)!.id : sp)) })}>✕</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">PFR must be ≤ VPIP. Bots derive their preflop ranges from these percentages (hands ranked by equity vs a random hand) and their postflop frequencies from the rest. See the freeplay mode for details.</p>
      </div>
    </Section>
  )
}

function ListNumberSetting({ values, onChange }: { values: number[]; onChange: (v: number[]) => void }) {
  const [draft, setDraft] = useState(values.join(', '))
  const commit = () => {
    const nums = draft.split(/[,\s]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0)
    if (nums.length) { onChange(nums.slice(0, 6)); setDraft(nums.slice(0, 6).join(', ')) }
  }
  return <TextInput value={draft} onChange={setDraft} onEnter={commit} mono className="w-44" />
}

function HudSettingsSection() {
  const { settings, update, resetSection } = useSettings()
  const items = settings.hud.items
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= items.length) return
    const next = [...items]
    ;[next[i], next[j]] = [next[j], next[i]]
    update('hud', { items: next })
  }
  return (
    <Section id="hud" title="Freeplay HUD" reset={() => resetSection('hud')}>
      <ul className="py-2">
        {items.map((it, i) => (
          <li key={it.id} className="flex items-center justify-between gap-3 py-1.5">
            <span className={cx('text-sm', !it.visible && 'text-muted line-through')}>{HUD_ITEMS.find((h) => h.id === it.id)?.label}</span>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</Button>
              <Button size="sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down">↓</Button>
              <Toggle checked={it.visible} onChange={(visible) => update('hud', { items: items.map((x) => (x.id === it.id ? { ...x, visible } : x)) })} label="Visible" />
            </div>
          </li>
        ))}
      </ul>
    </Section>
  )
}

function KeybindingsSection() {
  const { settings, update, resetSection } = useSettings()
  const [recording, setRecording] = useState<string | null>(null)
  const conflicts = findConflicts(settings.keybindings)
  const conflictIds = new Set(conflicts.flatMap((c) => c.actions))
  const scopes = Object.keys(SCOPE_LABELS) as HotkeyScope[]

  const onKeyDown = (actionId: string, e: React.KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Escape') { setRecording(null); return }
    const key = e.key === 'Backspace' || e.key === 'Delete' ? '' : eventToKey(e.nativeEvent)
    if (key === null) return
    update('keybindings', { ...settings.keybindings, [actionId]: key })
    setRecording(null)
  }

  return (
    <Section id="keybindings" title="Keyboard" reset={() => resetSection('keybindings')}>
      <p className="py-2 text-xs text-muted">Click a shortcut, then press the new key. Backspace clears it, Escape cancels. Shortcuts are ignored while typing in text fields.</p>
      {conflicts.length > 0 && (
        <div className="py-2"><ErrorNote>Conflicting shortcuts: {conflicts.map((c) => `${c.key} (${c.actions.map((a) => HOTKEY_ACTIONS.find((x) => x.id === a)?.label).join(', ')})`).join('; ')}</ErrorNote></div>
      )}
      {scopes.map((scope) => (
        <div key={scope} className="py-2">
          <h3 className="mb-1 text-xs uppercase tracking-wider text-muted">{SCOPE_LABELS[scope]}</h3>
          {HOTKEY_ACTIONS.filter((a) => a.scope === scope).map((a) => (
            <div key={a.id} className="flex items-center justify-between py-1">
              <span className="text-sm">{a.label}</span>
              <button
                onClick={() => setRecording(a.id)}
                onKeyDown={(e) => recording === a.id && onKeyDown(a.id, e)}
                onBlur={() => recording === a.id && setRecording(null)}
                className={cx('min-w-20 rounded-md border px-2 py-1 font-mono text-xs transition-ui',
                  recording === a.id ? 'border-accent text-fg' : conflictIds.has(a.id) ? 'border-bad text-bad' : 'border-line text-muted hover:text-fg')}
              >
                {recording === a.id ? 'press a key…' : settings.keybindings[a.id] || 'unset'}
              </button>
            </div>
          ))}
        </div>
      ))}
      <p className="py-2 text-xs text-muted">Tip: press <Kbd>?</Kbd> anywhere to see all shortcuts.</p>
    </Section>
  )
}

function DataSection() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [mode, setMode] = useState<'replace' | 'merge'>('replace')
  const load = useSettings((s) => s.load)

  const doExport = async () => {
    const data = await exportAll()
    downloadFile(`pokercoach-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 1))
    setMsg('Backup downloaded.')
  }
  const doImport = async (file: File) => {
    setErr(''); setMsg('')
    try {
      const backup = validateBackup(JSON.parse(await file.text()))
      if (mode === 'replace' && !confirm('Replace ALL current data with this backup?')) return
      const counts = await importAll(backup, mode)
      await load()
      setMsg(`Imported: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}. Reload the page to refresh every view.`)
    } catch (e) {
      setErr(e instanceof BackupError ? e.message : e instanceof SyntaxError ? 'The file is not valid JSON' : String(e))
    }
  }
  return (
    <Section id="data" title="Data">
      <Field label="Export all data" hint="Settings, ranges, quiz history, lesson progress, sessions and hands in one JSON file.">
        <Button onClick={doExport}>Download backup</Button>
      </Field>
      <Field label="Import backup">
        <div className="flex items-center gap-2">
          <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: 'replace', label: 'Replace' }, { value: 'merge', label: 'Merge' }]} />
          <Button onClick={() => fileRef.current?.click()}>Choose file…</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = '' }} />
        </div>
      </Field>
      <Field label="Delete all data" hint="Removes everything stored by PokerCoach in this browser.">
        <Button variant="danger" onClick={async () => { if (confirm('Delete ALL data? Export a backup first if unsure.')) { await clearAll(); await load(); setMsg('All data deleted.') } }}>Delete everything</Button>
      </Field>
      {(msg || err) && <div className="py-3">{err ? <ErrorNote>{err}</ErrorNote> : <p className="text-sm text-good">{msg}</p>}</div>}
    </Section>
  )
}
