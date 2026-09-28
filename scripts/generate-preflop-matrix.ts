/**
 * Generates src/engine/data/preflopMatrix.json: the all-in preflop equity of every hand class
 * against every hand class (169 x 169), computed by the engine's own Monte Carlo equity.
 *
 * Entry (i, j) = equity of class i vs class j, averaged uniformly over all card-disjoint combo
 * pairs (exactly the PokerStove "AKs vs QQ" convention). Stored as the upper triangle (i <= j),
 * scaled by 1e5; E(j, i) = 1 - E(i, j).
 *
 * Run: npx tsx scripts/generate-preflop-matrix.ts [trialsPerPair=60000]
 * Uses one child process per CPU. Deterministic: pair k uses seed 1000 + k.
 */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { fileURLToPath } from 'node:url'
import { HAND_CLASSES } from '../src/engine/combos'
import { monteCarloEquity } from '../src/engine/equity'

const N = 169
const pairs: [number, number][] = []
for (let i = 0; i < N; i++) for (let j = i; j < N; j++) pairs.push([i, j])

function computeRange(start: number, end: number, trials: number): number[] {
  const out: number[] = []
  for (let k = start; k < end; k++) {
    const [i, j] = pairs[k]
    const r = monteCarloEquity({
      players: [
        { combos: HAND_CLASSES[i].combos.map((combo) => ({ combo, weight: 1 })) },
        { combos: HAND_CLASSES[j].combos.map((combo) => ({ combo, weight: 1 })) },
      ],
      iterations: trials,
      seed: 1000 + k,
    })
    out.push(Math.round(r.players[0].equity * 1e5))
  }
  return out
}

async function main() {
  const trials = Number(process.argv[2] ?? 60000)
  const nw = cpus().length
  const chunk = Math.ceil(pairs.length / nw)
  const t0 = Date.now()
  const parts = await Promise.all(
    Array.from({ length: nw }, (_, w) => new Promise<number[]>((resolve, reject) => {
      const args = ['--import', 'tsx', fileURLToPath(import.meta.url), 'worker', String(w * chunk), String(Math.min(pairs.length, (w + 1) * chunk)), String(trials)]
      const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'inherit'] })
      let out = ''
      child.stdout.on('data', (d) => { out += d })
      child.on('exit', (code) => (code === 0 ? resolve(JSON.parse(out)) : reject(new Error(`worker ${w} exited ${code}`))))
    })),
  )
  const values = parts.flat()
  writeFileSync(
    new URL('../src/engine/data/preflopMatrix.json', import.meta.url),
    JSON.stringify({
      description: 'Preflop all-in equity of hand class i vs class j (upper triangle, i <= j, row-major, x1e5). Classes in HAND_CLASSES order.',
      generatedBy: 'scripts/generate-preflop-matrix.ts',
      method: 'monte-carlo',
      trialsPerPair: trials,
      maxStdError: Math.sqrt(0.25 / trials),
      values,
    }),
  )
  console.log(`Wrote ${values.length} entries in ${((Date.now() - t0) / 1000).toFixed(1)} s`)
}

if (process.argv[2] === 'worker') {
  const [start, end, trials] = process.argv.slice(3).map(Number)
  process.stdout.write(JSON.stringify(computeRange(start, end, trials)))
} else {
  void main()
}
