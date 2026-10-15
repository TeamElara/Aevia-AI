import { Fragment, type ReactNode } from 'react'
import { Tokens } from './ui'

// Deliberately small markdown subset. All content remains React text nodes;
// HTML, links, images and other unsupported syntax never create DOM elements.
function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /\*\*([^*\n]+)\*\*|`([^`\n]+)`/g
  let end = 0
  for (const match of text.matchAll(pattern)) {
    const at = match.index!
    nodes.push(<Tokens key={`text-${at}`} text={text.slice(end, at)} />)
    nodes.push(match[1] !== undefined
      ? <strong key={at}><Tokens text={match[1]} /></strong>
      : <code key={at}><Tokens text={match[2]} /></code>)
    end = at + match[0].length
  }
  nodes.push(<Tokens key="tail" text={text.slice(end)} />)
  return nodes
}

function cells(line: string): string[] {
  const source = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '')
  const result: string[] = []
  let cell = '', inCode = false
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (char === '\\' && source[i + 1] === '|') { cell += '|'; i++; continue }
    if (char === '`') inCode = !inCode
    if (char === '|' && !inCode) { result.push(cell.trim()); cell = '' }
    else cell += char
  }
  return [...result, cell.trim()]
}

const listItem = (line: string) => /^\s*(?:([-+*])|(\d+)\.)\s+(.+)$/.exec(line)
const fence = (line: string) => /^\s*```/.test(line)
const heading = (line: string) => /^(#{1,6})\s+(.+)$/.exec(line)
function tableHeader(lines: string[], i: number): string[] | null {
  if (!lines[i]?.includes('|') || !lines[i + 1]) return null
  const header = cells(lines[i]), rule = cells(lines[i + 1])
  return header.length > 1 && header.length === rule.length && rule.every(cell => /^:?-{3,}:?$/.test(cell)) ? header : null
}

export function Markdown({ text, animate = false }: { text: string; animate?: boolean }) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    if (!lines[i].trim()) { i++; continue }
    const start = i
    if (fence(lines[i])) {
      const code: string[] = []
      i++
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i++])
      if (i < lines.length) i++
      blocks.push(<pre key={start}><code>{code.join('\n')}</code></pre>)
      continue
    }
    const header = tableHeader(lines, i)
    if (header) {
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        const row = cells(lines[i])
        if (row.length !== header.length) break
        rows.push(row); i++
      }
      blocks.push(
        <div className="answer-table" key={start} tabIndex={0} role="region" aria-label="Answer table">
          <table><thead><tr>{header.map((cell, k) => <th scope="col" key={k}>{inline(cell)}</th>)}</tr></thead>
            <tbody>{rows.map((row, r) => <tr key={r}>{row.map((cell, k) => <td key={k}>{inline(cell)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      )
      continue
    }
    const item = listItem(lines[i])
    if (item) {
      const ordered = item[2] !== undefined
      const items: ReactNode[] = []
      while (i < lines.length) {
        const next = listItem(lines[i])
        if (!next || (next[2] !== undefined) !== ordered) break
        items.push(<li key={i}>{inline(next[3])}</li>); i++
      }
      blocks.push(ordered ? <ol key={start} start={Number(item[2])}>{items}</ol> : <ul key={start}>{items}</ul>)
      continue
    }
    const title = heading(lines[i])
    if (title) {
      // Replies live below the page heading; keep their outline at h3 or below.
      const Tag = `h${Math.min(6, title[1].length + 2)}` as 'h3' | 'h4' | 'h5' | 'h6'
      blocks.push(<Tag key={start}>{inline(title[2])}</Tag>); i++; continue
    }
    const paragraph: string[] = [lines[i++]]
    while (i < lines.length && lines[i].trim() && !fence(lines[i]) && !heading(lines[i]) && !listItem(lines[i]) && !tableHeader(lines, i)) paragraph.push(lines[i++])
    blocks.push(<p key={start}>{paragraph.map((line, k) => <Fragment key={k}>{k > 0 && <br />}{inline(line)}</Fragment>)}</p>)
  }
  return <div className={`answer-markdown${animate ? ' animate-msg' : ''}`}>{blocks}</div>
}
