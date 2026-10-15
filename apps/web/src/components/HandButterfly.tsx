import { useEffect, useId, useRef, useState } from 'react'

// The supplied illustration stays intact. These vector contours separate its
// subjects into independently moving layers without a rectangular photo edge.
export function HandButterfly() {
  const id = useId().replace(/:/g, '')
  const root = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const el = root.current
    if (!el) return
    let inViewport = true
    const update = () => setVisible(inViewport && !document.hidden)
    const observer = new IntersectionObserver(([entry]) => { inViewport = entry.isIntersecting; update() })
    observer.observe(el)
    document.addEventListener('visibilitychange', update)
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update) }
  }, [])
  return (
    <div ref={root} className="hand-scene" data-paused={paused || !visible}>
      <svg className="hand-illustration" viewBox="110 -130 550 1030" role="img" aria-label="A butterfly lifts from a robotic fingertip, floats upward, and returns.">
        <defs>
          {/* Remove the screenshot's grey paper while retaining the drawn ink.
              Transparent pixels stay transparent, including in dark mode. */}
          <filter id={`${id}-ink`} colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  -1 -1 -1 2.25 0" />
          </filter>
          <linearGradient id={`${id}-right-fade`} x1="520" x2="622" gradientUnits="userSpaceOnUse">
            <stop stopColor="white" /><stop offset="1" stopColor="black" />
          </linearGradient>
          <linearGradient id={`${id}-bottom-fade`} x1="0" y1="760" x2="0" y2="875" gradientUnits="userSpaceOnUse">
            <stop stopColor="white" /><stop offset="1" stopColor="black" />
          </linearGradient>
          <mask id={`${id}-right-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width="654" height="898" style={{ maskType: 'luminance' }}>
            <rect width="654" height="898" fill={`url(#${id}-right-fade)`} />
          </mask>
          <mask id={`${id}-bottom-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width="654" height="898" style={{ maskType: 'luminance' }}>
            <rect width="654" height="898" fill={`url(#${id}-bottom-fade)`} />
          </mask>
          <clipPath id={`${id}-hand`}>
            <path d="M194 201 Q191 189 213 198 L246 216 Q262 200 276 210 Q300 230 301 258 Q302 283 285 296 L297 318 L300 354 L312 330 L318 319 Q314 308 339 288 Q365 263 396 255 Q415 250 409 275 Q406 310 371 325 L359 345 L346 382 L372 397 L401 365 Q407 347 431 342 L452 335 L454 311 L443 275 L441 256 Q431 250 432 230 Q433 190 450 164 Q465 148 482 162 Q504 183 511 244 L506 256 L518 290 L534 335 L527 349 L544 397 L562 427 Q589 437 620 454 L621 874 L556 874 Q551 823 532 782 L516 755 L504 718 L484 679 L474 649 L450 631 L408 616 L388 596 L362 578 Q332 560 321 540 L289 494 L269 457 L251 436 Q235 419 233 402 L239 350 L239 309 L222 291 Q210 286 205 265 Z" />
          </clipPath>
          <clipPath id={`${id}-wing-a`}>
            <path d="M224 178 Q205 150 187 109 Q158 53 154 16 Q153 8 166 13 L187 31 L203 38 L215 51 L217 69 Q235 35 250 33 Q278 30 299 57 L315 65 Q326 75 317 92 L303 113 L288 143 L250 171 Z" />
          </clipPath>
          <clipPath id={`${id}-wing-b`}>
            <path d="M224 179 L252 153 L294 116 Q310 111 327 121 L335 138 L348 144 L357 150 L371 151 L360 162 L351 168 L344 176 L320 175 L296 181 L265 191 L239 187 L237 204 L229 199 Z" />
          </clipPath>
        </defs>
        <g className="robot-arm" mask={`url(#${id}-bottom-mask)`}>
          <image href="/art/robotic-hand-reference.png" width="654" height="898" clipPath={`url(#${id}-hand)`} mask={`url(#${id}-right-mask)`} filter={`url(#${id}-ink)`} />
        </g>
        <g className="butterfly-flight">
          <g className="butterfly-wing wing-a">
            <image href="/art/robotic-hand-reference.png" width="654" height="898" clipPath={`url(#${id}-wing-a)`} filter={`url(#${id}-ink)`} />
          </g>
          <g className="butterfly-wing wing-b">
            <image href="/art/robotic-hand-reference.png" width="654" height="898" clipPath={`url(#${id}-wing-b)`} filter={`url(#${id}-ink)`} />
          </g>
          <g fill="none" stroke="#242729" strokeWidth="2.1" strokeLinecap="round">
            <path d="M221 165 Q224 178 238 187 M224 172 Q189 143 154 146 M225 169 Q211 138 211 119 M230 181 L226 196 M234 184 L245 193" />
          </g>
        </g>
      </svg>
      <button className="motion-toggle" onClick={() => setPaused(v => !v)} aria-pressed={paused} aria-label={paused ? 'Play illustration animation' : 'Pause illustration animation'}>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">{paused ? <path d="M3 1.5 10 6 3 10.5Z" fill="currentColor" /> : <path d="M3 2v8M8 2v8" stroke="currentColor" strokeWidth="2" />}</svg>
        {paused ? 'Play motion' : 'Pause motion'}
      </button>
    </div>
  )
}
