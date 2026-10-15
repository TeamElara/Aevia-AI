// @vitest-environment jsdom
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Markdown } from '../src/components/Markdown'

function render(text: string) {
  return new DOMParser().parseFromString(renderToStaticMarkup(<Markdown text={text} />), 'text/html').body
}

describe('safe answer markdown', () => {
  it('renders bold, paragraphs, ordered and unordered lists, headings and tables', () => {
    const root = render('# Summary\n\nA **bold** answer.\nNext line.\n\n- First\n- Second\n\n3. Third\n4. Fourth\n\n| Band | Salary |\n| --- | ---: |\n| L5 | **100** |')
    expect(root.querySelector('h3')?.textContent).toBe('Summary')
    expect(root.querySelector('p strong')?.textContent).toBe('bold')
    expect(root.querySelector('p br')).not.toBeNull()
    expect(root.querySelectorAll('ul li')).toHaveLength(2)
    expect(root.querySelector('ol')?.getAttribute('start')).toBe('3')
    expect(root.querySelectorAll('ol li')).toHaveLength(2)
    expect(root.querySelectorAll('th[scope="col"]')).toHaveLength(2)
    expect(root.querySelector('td strong')?.textContent).toBe('100')
  })

  it('renders HTML, executable URLs and image syntax as inert text', () => {
    const attack = '**Safe** <img src=x onerror="alert(1)"><script>alert(2)</script><svg onload="alert(3)">\n\n[click](javascript:alert(4)) ![track](https://evil.example/pixel)'
    const root = render(attack)
    expect(root.querySelector('img,script,svg,a,iframe,style')).toBeNull()
    expect(root.querySelector('[onerror],[onload],[href],[src]')).toBeNull()
    expect(root.textContent).toContain('<script>alert(2)</script>')
    expect(root.textContent).toContain('[click](javascript:alert(4))')
    expect(root.querySelector('strong')?.textContent).toBe('Safe')
  })

  it('keeps fenced code literal and gateway tokens highlighted in formatted text', () => {
    const root = render('**[AADHAAR_K7Q2]** and `[SECRET_9QF4]`\n\n```html\n<script>**literal**</script>\n```')
    expect(root.querySelector('strong .tok')?.textContent).toBe('[AADHAAR_K7Q2]')
    expect(root.querySelector('p code .tok')?.textContent).toBe('[SECRET_9QF4]')
    expect(root.querySelector('pre code')?.textContent).toBe('<script>**literal**</script>')
    expect(root.querySelector('pre strong,pre script')).toBeNull()
  })

  it('handles escaped and code pipes without splitting table cells', () => {
    const root = render('| A | B |\n| --- | --- |\n| left \\| right | `x|y` |')
    expect([...root.querySelectorAll('td')].map(cell => cell.textContent)).toEqual(['left | right', 'x|y'])
  })

  it('preserves unmatched syntax and malformed table rows instead of dropping text', () => {
    const root = render('**unfinished\n\n| A | B |\n| --- | --- |\n| extra | cells | here |\n\n```\nunfinished code')
    expect(root.textContent).toContain('**unfinished')
    expect(root.textContent).toContain('| extra | cells | here |')
    expect(root.querySelector('pre')?.textContent).toBe('unfinished code')
  })
})
