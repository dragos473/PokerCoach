import { type ReactNode } from 'react'
import { Layout } from './Layout'
import { ThemeApplier } from './ThemeApplier'
import { matchRoute, usePath } from './router'
import { HomePage } from '../features/home/HomePage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { DiagnosticsPage } from '../features/diagnostics/DiagnosticsPage'
import { FormulasPage } from '../features/formulas/FormulasPage'
import { EmptyState } from '../components/ui'
import { RangeLibraryPage } from '../features/ranges/RangeLibraryPage'
import { RangeEditorPage } from '../features/ranges/RangeEditorPage'
import { ComparePage } from '../features/ranges/ComparePage'
import { DrillPage } from '../features/ranges/DrillPage'
import { CalculatorPage } from '../features/odds/CalculatorPage'
import { QuizPage } from '../features/odds/QuizPage'
import { QuizStatsPage } from '../features/odds/QuizStatsPage'
import { VariancePage } from '../features/odds/VariancePage'

type RouteDef = { pattern: string; render: (params: Record<string, string>) => ReactNode }

const ROUTES: RouteDef[] = [
  { pattern: '/', render: () => <HomePage /> },
  { pattern: '/settings', render: () => <SettingsPage /> },
  { pattern: '/formulas', render: () => <FormulasPage /> },
  { pattern: '/diagnostics', render: () => <DiagnosticsPage /> },
  { pattern: '/ranges', render: () => <RangeLibraryPage /> },
  { pattern: '/ranges/compare', render: () => <ComparePage /> },
  { pattern: '/ranges/drill', render: () => <DrillPage /> },
  { pattern: '/ranges/:id', render: (p) => <RangeEditorPage id={p.id} /> },
  { pattern: '/odds', render: () => <CalculatorPage /> },
  { pattern: '/odds/quiz', render: () => <QuizPage /> },
  { pattern: '/odds/stats', render: () => <QuizStatsPage /> },
  { pattern: '/odds/variance', render: () => <VariancePage /> },
]

export function App() {
  const path = usePath()
  let content: ReactNode = null
  for (const r of ROUTES) {
    const params = matchRoute(r.pattern, path)
    if (params) { content = r.render(params); break }
  }
  return (
    <>
      <ThemeApplier />
      <Layout>
        {content ?? <EmptyState title="Not built yet" action={<a className="text-info underline" href="#/">Back home</a>}>This mode arrives in a later phase.</EmptyState>}
      </Layout>
    </>
  )
}
