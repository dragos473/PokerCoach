/** Reference of every formula in the engine, with an interactive calculator for each. */
import { useState } from 'react'
import { FORMULAS, type FormulaDef } from '../../engine/formulas'
import { MathExplain } from '../../components/MathExplain'
import { Badge, NumberInput, PageHeader, Panel } from '../../components/ui'

const EXAMPLES: Record<string, Record<string, number>> = {
  pairCombos: { cardsLeft: 4 },
  unpairedCombos: { highLeft: 4, lowLeft: 4, suitedPairsLeft: 4 },
  totalStartingHands: { deck: 52 },
  potOddsRatio: { pot: 150, call: 50 },
  requiredEquity: { pot: 150, call: 50 },
  evCall: { pot: 150, call: 50, equity: 0.3 },
  evFold: {},
  evBet: { pot: 100, risk: 50, villainCall: 50, foldProb: 0.4, equityWhenCalled: 0.2 },
  foldEquityValue: { pot: 100, foldProb: 0.4 },
  breakEvenFold: { pot: 100, risk: 50 },
  breakEvenFoldWithEquity: { pot: 100, risk: 50, villainCall: 50, equityWhenCalled: 0.2 },
  mdf: { pot: 100, bet: 50 },
  alpha: { pot: 100, bet: 50 },
  bluffFraction: { pot: 100, bet: 100 },
  spr: { effectiveStack: 97, pot: 6.5 },
  hitNextCard: { outs: 9, unseen: 46 },
  hitByRiver: { outs: 9, unseen: 47 },
  ruleOf2: { outs: 9 },
  ruleOf4: { outs: 9 },
  impliedOddsNeeded: { pot: 150, call: 50, hitProb: 0.1957 },
  evWithImpliedOdds: { pot: 150, call: 50, pHitWin: 0.18, pHitLose: 0.02, impliedWin: 100, reverseImpliedLoss: 60 },
}

function FormulaCard({ id, f }: { id: string; f: FormulaDef<Record<string, number>> }) {
  const [input, setInput] = useState<Record<string, number>>(EXAMPLES[id] ?? {})
  const vars = Object.keys(f.variables)
  return (
    <Panel title={f.name} actions={<Badge tone={f.kind === 'math' ? 'good' : f.kind === 'model' ? 'info' : 'warn'}>{f.kind}</Badge>}>
      <p className="mb-3 text-sm text-muted">{f.description}</p>
      {vars.length > 0 && (
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          {vars.map((v) => (
            <label key={v} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted">{(f.variables as Record<string, string>)[v]}</span>
              <NumberInput value={input[v] ?? 0} step={0.01} onChange={(n) => setInput({ ...input, [v]: n })} className="h-8 w-24" />
            </label>
          ))}
        </div>
      )}
      <MathExplain e={f.explain(input)} />
    </Panel>
  )
}

export function FormulasPage() {
  return (
    <div>
      <PageHeader title="Formula reference" subtitle="Every formula used anywhere in the app, with its assumptions. Change the inputs to see the working." />
      <div className="grid gap-4 lg:grid-cols-2">
        {Object.entries(FORMULAS).map(([id, f]) => <FormulaCard key={id} id={id} f={f as unknown as FormulaDef<Record<string, number>>} />)}
      </div>
    </div>
  )
}
