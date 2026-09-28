import { PageHeader } from '../../components/ui'
import { BookIcon, GridIcon, PercentIcon, TableIcon, FunctionIcon, ChartIcon } from '../../components/icons'

const MODES = [
  { href: '#/freeplay', icon: TableIcon, title: 'Freeplay', text: 'Play hands against explainable bots with a live HUD: equity vs your read, EV of each option, fold equity, after-hand review.' },
  { href: '#/ranges', icon: GridIcon, title: 'Preflop ranges', text: 'Edit and study range charts, combos, category breakdowns and equity heatmaps. Drill yourself against any chart.' },
  { href: '#/odds', icon: PercentIcon, title: 'Odds lab', text: 'Equity & EV calculator with the math shown, a quizzer with spaced repetition, and a variance simulator.' },
  { href: '#/lessons', icon: BookIcon, title: 'Lessons', text: 'Interactive lessons from hand rankings to MDF, with engine-computed numbers and end-of-lesson quizzes.' },
  { href: '#/formulas', icon: FunctionIcon, title: 'Formula reference', text: 'Every formula in the app with its assumptions and a live calculator.' },
  { href: '#/diagnostics', icon: ChartIcon, title: 'Engine diagnostics', text: 'Reference equity matchups recomputed live to verify the engine.' },
]

export function HomePage() {
  return (
    <div>
      <PageHeader title="Welcome back" subtitle="Pick a mode. Everything runs locally in your browser." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MODES.map((m) => (
          <a key={m.href} href={m.href} className="group rounded-lg border border-line bg-surface p-4 transition-ui hover:border-muted/50">
            <m.icon className="mb-3 h-6 w-6 text-accent" />
            <h2 className="font-semibold">{m.title}</h2>
            <p className="mt-1 text-sm text-muted">{m.text}</p>
          </a>
        ))}
      </div>
    </div>
  )
}
