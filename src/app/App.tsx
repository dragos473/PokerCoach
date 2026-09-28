import { lazy, Suspense, type ReactNode } from 'react'
import { Layout } from './Layout'
import { ThemeApplier } from './ThemeApplier'
import { matchRoute, usePath } from './router'
import { HomePage } from '../features/home/HomePage'
import { EmptyState, Spinner } from '../components/ui'
import { ErrorBoundary } from '../components/ErrorBoundary'

// Feature pages are code-split: each mode loads on first visit (and is precached by the PWA).
const SettingsPage = lazy(() => import('../features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const DiagnosticsPage = lazy(() => import('../features/diagnostics/DiagnosticsPage').then((m) => ({ default: m.DiagnosticsPage })))
const FormulasPage = lazy(() => import('../features/formulas/FormulasPage').then((m) => ({ default: m.FormulasPage })))
const RangeLibraryPage = lazy(() => import('../features/ranges/RangeLibraryPage').then((m) => ({ default: m.RangeLibraryPage })))
const RangeEditorPage = lazy(() => import('../features/ranges/RangeEditorPage').then((m) => ({ default: m.RangeEditorPage })))
const ComparePage = lazy(() => import('../features/ranges/ComparePage').then((m) => ({ default: m.ComparePage })))
const DrillPage = lazy(() => import('../features/ranges/DrillPage').then((m) => ({ default: m.DrillPage })))
const CalculatorPage = lazy(() => import('../features/odds/CalculatorPage').then((m) => ({ default: m.CalculatorPage })))
const QuizPage = lazy(() => import('../features/odds/QuizPage').then((m) => ({ default: m.QuizPage })))
const QuizStatsPage = lazy(() => import('../features/odds/QuizStatsPage').then((m) => ({ default: m.QuizStatsPage })))
const VariancePage = lazy(() => import('../features/odds/VariancePage').then((m) => ({ default: m.VariancePage })))
const LessonsPage = lazy(() => import('../features/lessons/LessonsPage').then((m) => ({ default: m.LessonsPage })))
const LessonPage = lazy(() => import('../features/lessons/LessonsPage').then((m) => ({ default: m.LessonPage })))
const FreeplayPage = lazy(() => import('../features/freeplay/FreeplayPage').then((m) => ({ default: m.FreeplayPage })))
const HistoryPage = lazy(() => import('../features/freeplay/HistoryPage').then((m) => ({ default: m.HistoryPage })))

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
  { pattern: '/lessons', render: () => <LessonsPage /> },
  { pattern: '/lessons/:id', render: (p) => <LessonPage id={p.id} /> },
  { pattern: '/freeplay', render: () => <FreeplayPage /> },
  { pattern: '/freeplay/history', render: () => <HistoryPage /> },
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
        <ErrorBoundary key={path}>
          <Suspense fallback={<div className="flex items-center gap-2 text-sm text-muted"><Spinner /> Loading…</div>}>
            {content ?? <EmptyState title="Page not found" action={<a className="text-info underline" href="#/">Back home</a>}>There is nothing at this address.</EmptyState>}
          </Suspense>
        </ErrorBoundary>
      </Layout>
    </>
  )
}
