import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { actionLabel, answerText, isStop, type ChatResponse } from '../api/contract'
import { starters, type DemoUser } from '../data/demo'
import { replaceSecrets } from '../lib/secrets'
import { toneOf, type Tone } from '../lib/tone'
import { ActionBadge } from './PayloadCard'
import { reducedMotion } from '../lib/motion'
import { Arrow, BrandMark, Icon, Magnetic, Orb, Tokens } from './ui'
import { HandButterfly } from './HandButterfly'
import { BarIntro } from './BarIntro'
import { Markdown } from './Markdown'
import { AttachmentCard, FileChip } from './Attachment'
import { MAX_PDF_BYTES, MAX_PHOTO_BYTES, UPLOAD_TYPES, type Backend } from '../api/client'

export type Turn = {
  id: string
  prompt: string
  status: 'pending' | 'done' | 'error'
  /** A photo or PDF sent with the message; only its name and size are kept here. */
  file?: { name: string; size: number }
  response?: ChatResponse
  error?: string
  /** Shown above the answer, e.g. when the gateway had to start a fresh conversation. */
  notice?: string
}

// Gateway codes for file uploads, as sentences.
const UPLOAD_ERRORS: Record<string, string> = {
  UNSUPPORTED_FILE: 'That file type is not supported. Send a PNG, JPEG or WebP photo, or a PDF.',
  FILE_TOO_LARGE: 'That file is too large. Send a photo, or a PDF up to 3 MB.',
  PAYLOAD_TOO_LARGE: 'That file is too large. Send a photo, or a PDF up to 3 MB.',
  PHOTO_UNREADABLE: 'That photo could not be opened in the browser. Try a PNG or JPEG.',
  CONVERSATION_BUSY: 'The previous message in this chat is still running. Wait for it, then send again.',
  RATE_LIMITED: 'Too many requests in a minute. Wait a few seconds, then send again.',
  TOO_MANY_PAGES: 'That PDF has more than 20 pages.',
  TOO_MANY_SCANNED_PAGES: 'That PDF has more than 5 scanned pages.',
  NO_TEXT_FOUND: 'No readable text was found in that file.',
  UNREADABLE_FILE: 'That file could not be read. It may be damaged or password-protected.',
  ATTACHMENT_BUSY: 'The gateway is reading other files. Try again in a moment.',
  OCR_TIMEOUT: 'Reading that file took too long. Try a clearer or smaller image.',
  ATTACHMENTS_UNAVAILABLE: 'This gateway does not accept files yet.',
  ATTACHMENTS_NEED_GATEWAY: 'Files need the live gateway; the offline demo cannot read them.',
  GATEWAY_UNREACHABLE: "Can't reach the gateway. Check that it is running, then send again.",
  INVALID_REQUEST: 'The gateway could not accept that message. Messages can be up to 30,000 characters.',
}

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

// The whole Chat page: a greeting and one box when empty, a quiet thread
// once it starts. Everything else lives behind the sidebar and the Inspect links.
export function ChatPanel({
  user,
  backend,
  ready,
  turns,
  selectedId,
  tone,
  pulseKey,
  onSend,
  onInspect,
  onShowExamples,
  actingPosts,
}: {
  user: DemoUser
  backend: Backend | null
  ready: boolean
  turns: Turn[]
  selectedId: string | null
  tone: Tone
  pulseKey?: string
  onSend: (text: string, file?: File) => void
  onInspect: (id: string) => void
  onShowExamples: () => void
  actingPosts?: ReactNode
}) {
  const busy = turns.some((t) => t.status === 'pending')
  const lastStatus = turns[turns.length - 1]?.status
  const [focusRequest, setFocusRequest] = useState(0)

  useEffect(() => {
    if (turns.length) window.scrollTo({ top: document.documentElement.scrollHeight, behavior: reducedMotion() ? 'instant' : 'smooth' })
  }, [turns.length, lastStatus])

  if (turns.length === 0) {
    return (
      <section data-tone={tone} className="home-panel">
        <header className={`home-topline${actingPosts ? ' has-acting-posts' : ''}`}>
          <span>Private by design.</span>
          <span className="home-status"><span className="live-dot" />{backend === 'mock' ? 'mock' : backend === 'simulated' ? 'simulated' : ready ? 'live gateway' : 'connecting…'}</span>
          {actingPosts && <div className="w-full">{actingPosts}</div>}
        </header>
        <div className="home-hero">
          <div className="home-copy">
            <div className="hero-brand"><BrandMark size={64} /><span className="font-display text-[24px] font-semibold tracking-[-0.03em]">LeakShield</span></div>
            <h1 className="home-title"><span className="hero-title-line">AI WITHOUT</span><span className="hero-title-line">THE EXPOSURE.</span></h1>
            <p className="home-description">Ask freely. Private values stay protected.<br />Your ideas are what reach the model.</p>
            <button className="hero-cta" onClick={() => setFocusRequest(n => n + 1)} disabled={!ready}>Start a conversation <Arrow /></button>
          </div>
          <HandButterfly />
        </div>
        <div className="home-workspace">
          <div className="home-greeting"><h2>{greeting()}, {user.name.split(' ')[0]}.</h2><p>{ready ? 'What can I help with?' : 'Signing you in…'}</p></div>
          <BarIntro><Composer onSend={onSend} disabled={!ready} busy={false} big focusRequest={focusRequest} /></BarIntro>
          <ul className="home-starters">
            {starters.map(s => <li key={s}><button disabled={!ready} onClick={() => onSend(s)}>{s}<Arrow /></button></li>)}
          </ul>
          <button onClick={onShowExamples} className="home-inspect"><Icon name="eye" className="h-4 w-4" />See what the model actually receives<Arrow /></button>
        </div>
      </section>
    )
  }

  return (
    <section data-tone={tone} className="relative z-10 mx-auto flex min-h-[calc(100vh-72px)] w-full max-w-[760px] flex-col lg:min-h-screen">
      <div className="sticky top-[72px] z-10 flex w-screen -translate-x-1/2 lg:top-0 flex-wrap items-center justify-center gap-2.5 bg-gradient-to-b from-paper/95 via-paper/70 to-transparent px-4 pb-8 pt-5 text-[13px] text-faint backdrop-blur-[2px] [margin-left:50%] lg:w-[calc(100vw-264px)]">
        <Orb tone={tone} size={24} busy={busy} pulseKey={pulseKey} anchor />
        <span>
          {user.name} · {busy ? 'checking…' : `${turns.length} ${turns.length === 1 ? 'message' : 'messages'}`}
        </span>
        {actingPosts && <div className="w-full max-w-[760px]">{actingPosts}</div>}
      </div>

      <div className="relative flex-1 space-y-8 pb-6">
        {turns.map((t) => (
          <TurnView
            key={t.id}
            turn={t}
            inspected={t.id === selectedId}
            fresh={t.id === pulseKey}
            onInspect={() => onInspect(t.id)}
            onResend={busy || !ready ? undefined : onSend}
            backend={backend}
          />
        ))}
      </div>

      <div className="sticky bottom-0 z-10 w-screen -translate-x-1/2 bg-gradient-to-t from-paper via-paper/85 to-transparent px-4 pb-5 pt-10 [margin-left:50%] sm:px-8 lg:w-[calc(100vw-264px)] lg:px-12">
        <div className="mx-auto max-w-[760px]">
          <Composer onSend={onSend} disabled={!ready || busy} busy={busy} />
        </div>
      </div>
    </section>
  )
}

function TurnView({
  turn,
  fresh,
  inspected,
  onInspect,
  onResend,
  backend,
}: {
  turn: Turn
  fresh: boolean
  inspected: boolean
  onInspect: () => void
  onResend?: (text: string) => void
  backend: Backend | null
}) {
  const r = turn.response
  const safer = r?.action === 'block' && r.findings.some((f) => f.category === 'SECRET') ? replaceSecrets(turn.prompt) : null
  const canReplace = safer !== null && safer !== turn.prompt
  const tone: Tone = turn.status === 'pending' ? 'idle' : toneOf(r?.action)
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="flex max-w-[85%] flex-col items-end gap-2">
          {turn.file && <FileChip name={turn.file.name} size={turn.file.size} />}
          {turn.prompt && (
            <p className="origin-bottom-right animate-pop whitespace-pre-wrap break-words rounded-[20px] rounded-br-[6px] border border-line-2 bg-surface/90 px-4 py-2.5 text-[15px] leading-relaxed text-fg shadow-[var(--shadow)] backdrop-blur">
              <Tokens text={turn.prompt} />
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <span className="mt-0.5">
          <Orb
            tone={turn.status === 'error' ? 'stop' : tone}
            size={24}
            busy={turn.status === 'pending'}
            anchor={turn.status === 'pending'}
            pulseKey={fresh ? turn.id : undefined}
          />
        </span>
        <div className="min-w-0 flex-1 animate-msg">
          {turn.status === 'pending' && (
            <p data-tone="idle" className="flex h-[22px] items-center gap-3 text-[13.5px] text-faint">
              <span className="wave" aria-hidden="true">
                {Array.from({ length: 7 }, (_, i) => (
                  <i key={i} style={{ ['--d' as string]: i }} />
                ))}
              </span>
              <span className="sheen sheen-fast">{turn.file ? 'Reading the file on the gateway' : 'Running the checks'}</span>
            </p>
          )}

          {turn.status === 'error' && <p className="text-[15px] text-muted">{UPLOAD_ERRORS[turn.error ?? ''] ?? `Gateway error: ${turn.error}`}</p>}

          {r && (
            <>
              {turn.notice && <p role="status" className="mb-2 text-[12.5px] text-faint">{turn.notice}</p>}
              <Markdown text={answerText(r)} animate={fresh} />
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12.5px] text-faint">
                <ActionBadge label={actionLabel[r.action]} stop={isStop(r.action)} className={fresh ? 'verdict' : ''} />
                {backend === 'mock' && <span className="chip py-0.5">mock</span>}
                {r.reason && <span className="text-muted">{r.reason}</span>}
                <button
                  onClick={onInspect}
                  aria-pressed={inspected}
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-faint transition hover:bg-surface-2 hover:text-fg"
                >
                  <Icon name="eye" className="h-[15px] w-[15px]" />
                  Inspect
                </button>
                <span className="tabular-nums">
                  {r.provider_calls} model {r.provider_calls === 1 ? 'call' : 'calls'}
                </span>
              </div>
              {r.citations.length > 0 && (
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-faint">
                  <Icon name="file" className="h-[14px] w-[14px]" />
                  Sources:
                  {r.citations.map((c) => <span key={c.doc_id} className="tag">{c.title}</span>)}
                </p>
              )}
              {r.attachment && <AttachmentCard attachment={r.attachment} stopped={r.provider_calls === 0 && isStop(r.action)} />}
            </>
          )}

          {canReplace && (
            <button onClick={() => onResend?.(safer!)} disabled={!onResend} className="btn btn-primary btn-sm mt-4 font-mono text-[12px]">
              Replace with [SECRET_…] and send
              <Arrow />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// The gateway accepts messages up to this many characters.
const MAX_MESSAGE = 30_000

const hints = [
  'Message LeakShield…',
  'Paste a log with an API key. It never reaches the model.',
  'Ask for a letter with an Aadhaar number in it…',
  'Ask about a document you may not be allowed to see…',
]

// Cycles the placeholder like someone typing, while the box is empty.
function useTypewriter(active: boolean) {
  const [shown, setShown] = useState(hints[0])
  useEffect(() => {
    if (!active || reducedMotion()) {
      setShown(hints[0])
      return
    }
    let phrase = 0
    let len = hints[0].length
    let deleting = false
    let timer = window.setTimeout(function tick() {
      const full = hints[phrase]
      if (!deleting && len === full.length) {
        deleting = true
        timer = window.setTimeout(tick, 2600)
        return
      }
      if (deleting && len === 0) {
        deleting = false
        phrase = (phrase + 1) % hints.length
      }
      len += deleting ? -1 : 1
      setShown(hints[phrase].slice(0, len))
      timer = window.setTimeout(tick, deleting ? 18 : 38)
    }, 2600)
    return () => clearTimeout(timer)
  }, [active])
  return shown
}

function Composer({ onSend, disabled, busy, big, focusRequest = 0 }: { onSend: (t: string, file?: File) => void; disabled: boolean; busy: boolean; big?: boolean; focusRequest?: number }) {
  const [text, setText] = useState('')
  const [focused, setFocused] = useState(false)
  const [launches, setLaunches] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  // The type and size are checked again on the gateway; this only saves a wasted upload.
  const choose = (picked: File | undefined) => {
    if (!picked) return
    if (!UPLOAD_TYPES.split(',').includes(picked.type)) return setFileError('Choose a PNG, JPEG or WebP photo, or a PDF.')
    // Photos are shrunk in the browser before upload; PDFs are sent as they are.
    if (picked.type === 'application/pdf' ? picked.size > MAX_PDF_BYTES : picked.size > MAX_PHOTO_BYTES) {
      return setFileError(picked.type === 'application/pdf' ? 'That PDF is larger than 3 MB.' : 'That photo is larger than 25 MB.')
    }
    setFileError(null)
    setFile(picked)
    box.current?.focus()
  }
  useEffect(() => {
    const input = box.current
    const panel = input?.closest<HTMLElement>('.composer')
    if (!focusRequest || !input || !panel) return

    // Focus without a browser jump, then guide the viewport to the field.
    // Recompute the destination as the mobile keyboard changes the viewport.
    input.focus({ preventScroll: true })
    const destination = () => {
      const rect = panel.getBoundingClientRect()
      const viewport = window.visualViewport
      const height = viewport?.height ?? window.innerHeight
      const top = viewport?.offsetTop ?? 0
      const header = window.innerWidth < 1024 ? 72 : 0
      const target = window.scrollY + rect.top - top - header - Math.max(12, (height - header - rect.height) / 2)
      return Math.max(0, Math.min(target, document.documentElement.scrollHeight - window.innerHeight))
    }
    if (reducedMotion()) {
      window.scrollTo({ top: destination(), behavior: 'instant' })
      return
    }
    const start = window.scrollY
    const started = performance.now()
    let frame = 0
    let arrival: Animation | undefined
    let highlight: Animation | undefined
    const stop = () => { cancelAnimationFrame(frame); arrival?.cancel(); highlight?.cancel() }
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / 850)
      const ease = 1 - (1 - progress) ** 4
      window.scrollTo({ top: start + (destination() - start) * ease, behavior: 'instant' })
      if (progress < 1) frame = requestAnimationFrame(step)
      else {
        arrival = panel.animate([{ transform: 'scale(.985)' }, { transform: 'scale(1)' }], { duration: 550, easing: 'cubic-bezier(.16,1,.3,1)' })
        highlight = panel.querySelector('.composer-arrival')?.animate([
          { opacity: 0, transform: 'scale(.99)' },
          { opacity: .65, transform: 'scale(1)', offset: .3 },
          { opacity: 0, transform: 'scale(1.02)' },
        ], { duration: 900, easing: 'ease-out' })
      }
    }
    frame = requestAnimationFrame(step)
    const events = ['wheel', 'touchstart', 'pointerdown', 'keydown', 'visibilitychange'] as const
    events.forEach(event => window.addEventListener(event, stop, { passive: true }))
    return () => { stop(); events.forEach(event => window.removeEventListener(event, stop)) }
  }, [focusRequest])
  const hint = useTypewriter(!text && !focused)
  const submit = () => {
    const t = text.trim()
    if ((!t && !file) || disabled) return
    onSend(t, file ?? undefined)
    setText('')
    setFile(null)
    setFileError(null)
    if (picker.current) picker.current.value = ''
    setLaunches((n) => n + 1)
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }
  const lines = Math.min(6, Math.max(big ? 4 : 1, text.split('\n').length))
  return (
    <div
      onClick={() => box.current?.focus()}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true) } }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files[0]) }}
      data-busy={busy ? 'true' : undefined}
      className={`composer ${big ? 'composer-large' : ''} cursor-text rounded-[24px] border bg-surface/90 p-2 pl-5 text-left shadow-[var(--shadow-lg)] backdrop-blur-xl transition-[border-color] duration-300 focus-within:border-transparent ${dragging ? 'border-accent' : 'border-line'}`}
    >
      {big && <span className="composer-arrival" aria-hidden="true" />}
      {(file || fileError) && (
        <div className="flex flex-wrap items-center gap-2 pb-1 pr-2 pt-1">
          {file && <FileChip name={file.name} size={file.size} onRemove={() => { setFile(null); if (picker.current) picker.current.value = '' }} />}
          {fileError && <span role="alert" className="text-[12.5px] text-muted">{fileError}</span>}
        </div>
      )}
      <div className="relative flex items-end gap-3">
        {!text && (
          <span aria-hidden="true" className="pointer-events-none absolute left-0 right-[100px] top-2 text-[15.5px] leading-relaxed text-faint">
            {hint}
            {!focused && <span className="ml-px inline-block h-[1.1em] w-px translate-y-[3px] animate-pulse bg-faint" />}
          </span>
        )}
        <textarea
          ref={box}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          rows={lines}
          maxLength={MAX_MESSAGE}
          aria-label="Message"
          className="max-h-48 min-w-0 flex-1 resize-none self-center bg-transparent py-2 text-[15.5px] leading-relaxed text-fg focus:outline-none"
        />
        {text.length > MAX_MESSAGE * 0.9 && (
          <span className="self-center text-[11.5px] tabular-nums text-faint" aria-live="polite">{text.length.toLocaleString('en-IN')} / {MAX_MESSAGE.toLocaleString('en-IN')}</span>
        )}
        <input ref={picker} type="file" accept={UPLOAD_TYPES} className="hidden" onChange={(e) => choose(e.target.files?.[0])} tabIndex={-1} aria-hidden="true" />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); picker.current?.click() }}
          disabled={disabled}
          aria-label="Attach a photo or PDF"
          title="Attach a photo or PDF. It is read on the gateway and sensitive values are hidden."
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-fg disabled:opacity-30"
        >
          <Icon name="clip" className="h-[19px] w-[19px]" />
        </button>
        <Magnetic strength={0.3}>
          <button
            onClick={submit}
            disabled={disabled || (!text.trim() && !file)}
            aria-label="Send"
            className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-fg text-void shadow-[0_6px_20px_-6px_var(--tone)] transition duration-300 [transition-timing-function:var(--ease-spring)] hover:scale-110 active:scale-90 disabled:scale-90 disabled:opacity-20 disabled:shadow-none"
          >
            <span key={launches} className={launches ? 'launch' : ''}>
              <Icon name="up" className="h-[18px] w-[18px]" />
            </span>
          </button>
        </Magnetic>
      </div>
    </div>
  )
}
