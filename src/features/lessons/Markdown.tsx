/**
 * Markdown → React using marked's lexer (no raw HTML injection). Inline {{expressions}} are
 * protected before lexing and rendered as live <Expr> components. Callouts: > [!math|heuristic|note].
 */
import { marked, type Token, type Tokens } from 'marked'
import type { ReactNode } from 'react'
import { Expr } from './Expr'
import { cx } from '../../lib/cx'

const MARK = ''

function protect(md: string): { text: string; exprs: string[] } {
  const exprs: string[] = []
  const text = md.replace(/\{\{([^{}]+)\}\}/g, (_, e: string) => `${MARK}${exprs.push(e) - 1}${MARK}`)
  return { text, exprs }
}

function withExprs(text: string, exprs: string[], key: string): ReactNode[] {
  const out: ReactNode[] = []
  const parts = text.split(new RegExp(`${MARK}(\\d+)${MARK}`))
  parts.forEach((p, i) => {
    if (i % 2 === 1) out.push(<Expr key={`${key}e${i}`} source={exprs[Number(p)]} />)
    else if (p) out.push(decode(p))
  })
  return out
}

function decode(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
}

function inline(tokens: Token[] | undefined, exprs: string[], key = 'i'): ReactNode[] {
  if (!tokens) return []
  return tokens.map((t, i) => {
    const k = `${key}-${i}`
    switch (t.type) {
      case 'text':
      case 'escape': {
        const tt = t as Tokens.Text
        return tt.tokens ? <span key={k}>{inline(tt.tokens, exprs, k)}</span> : <span key={k}>{withExprs(tt.text, exprs, k)}</span>
      }
      case 'strong': return <strong key={k}>{inline((t as Tokens.Strong).tokens, exprs, k)}</strong>
      case 'em': return <em key={k}>{inline((t as Tokens.Em).tokens, exprs, k)}</em>
      case 'del': return <del key={k}>{inline((t as Tokens.Del).tokens, exprs, k)}</del>
      case 'codespan': return <code key={k}>{decode((t as Tokens.Codespan).text)}</code>
      case 'br': return <br key={k} />
      case 'link': {
        const l = t as Tokens.Link
        const external = /^https?:/.test(l.href)
        return <a key={k} href={l.href} target={external ? '_blank' : undefined} rel="noreferrer">{inline(l.tokens, exprs, k)}</a>
      }
      default: return <span key={k}>{'raw' in t ? withExprs(String(t.raw), exprs, k) : null}</span>
    }
  })
}

const CALLOUTS = {
  math: { label: 'Mathematical fact', cls: 'border-good/40 bg-good/5', tone: 'text-good' },
  heuristic: { label: 'Strategic heuristic (not a mathematical fact)', cls: 'border-warn/40 bg-warn/5', tone: 'text-warn' },
  note: { label: 'Note', cls: 'border-info/40 bg-info/5', tone: 'text-info' },
} as const

function block(t: Token, exprs: string[], key: string): ReactNode {
  switch (t.type) {
    case 'heading': {
      const h = t as Tokens.Heading
      const children = inline(h.tokens, exprs, key)
      if (h.depth === 1) return <h1 key={key}>{children}</h1>
      if (h.depth === 2) return <h2 key={key}>{children}</h2>
      return <h3 key={key}>{children}</h3>
    }
    case 'paragraph': return <p key={key}>{inline((t as Tokens.Paragraph).tokens, exprs, key)}</p>
    case 'list': {
      const l = t as Tokens.List
      const items = l.items.map((it, i) => <li key={i}>{it.tokens.map((c, j) => (c.type === 'text' ? <span key={j}>{inline((c as Tokens.Text).tokens ?? [c], exprs, `${key}-${i}-${j}`)}</span> : block(c, exprs, `${key}-${i}-${j}`)))}</li>)
      return l.ordered ? <ol key={key} start={typeof l.start === 'number' ? l.start : undefined}>{items}</ol> : <ul key={key}>{items}</ul>
    }
    case 'blockquote': {
      const b = t as Tokens.Blockquote
      const first = b.tokens[0] as Tokens.Paragraph | undefined
      const m = first?.type === 'paragraph' ? first.text.match(/^\[!(math|heuristic|note)\]\s*/) : null
      if (m) {
        const kind = m[1] as keyof typeof CALLOUTS
        const c = CALLOUTS[kind]
        const rest = marked.lexer(b.tokens.map((x) => x.raw).join('').replace(/^\[!(math|heuristic|note)\]\s*/, ''))
        return (
          <div key={key} className={cx('my-4 rounded-md border p-3 text-[0.95em]', c.cls)}>
            <p className={cx('!mt-0 mb-1 text-xs font-semibold uppercase tracking-wider', c.tone)}>{c.label}</p>
            {rest.map((x, i) => block(x, exprs, `${key}-c${i}`))}
          </div>
        )
      }
      return <blockquote key={key}>{b.tokens.map((x, i) => block(x, exprs, `${key}-${i}`))}</blockquote>
    }
    case 'table': {
      const tb = t as Tokens.Table
      return (
        <div key={key} className="overflow-x-auto">
          <table>
            <thead><tr>{tb.header.map((h, i) => <th key={i}>{inline(h.tokens, exprs, `${key}-h${i}`)}</th>)}</tr></thead>
            <tbody>{tb.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{inline(c.tokens, exprs, `${key}-${i}-${j}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )
    }
    case 'code': return <pre key={key} className="my-3 overflow-x-auto rounded-md bg-surface-2 p-3 font-mono text-xs">{(t as Tokens.Code).text}</pre>
    case 'hr': return <hr key={key} className="my-6 border-line" />
    case 'space': return null
    case 'text': return <p key={key}>{inline((t as Tokens.Text).tokens ?? [t], exprs, key)}</p>
    default: return null
  }
}

export function Markdown({ text }: { text: string }) {
  const { text: safe, exprs } = protect(text)
  const tokens = marked.lexer(safe)
  return <>{tokens.map((t, i) => block(t, exprs, `b${i}`))}</>
}
