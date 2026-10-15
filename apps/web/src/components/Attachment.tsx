import { Fragment, useState } from 'react'
import type { AttachmentSummary } from '../api/contract'
import { Icon, Modal } from './ui'

const LABELS: Record<string, string> = {
  AADHAAR: 'Aadhaar', VID: 'Aadhaar VID', PAN: 'PAN', CARD: 'Card', BANK_ACCOUNT: 'Bank account', IFSC: 'IFSC', UPI: 'UPI',
  PHONE: 'Phone', EMAIL: 'Email', SECRET: 'Secret', CONFIDENTIAL: 'Codename', INJECTION: 'Instruction',
}
const label = (category: string) => LABELS[category] ?? category.charAt(0) + category.slice(1).toLowerCase().replace(/_/g, ' ')

const fileSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

/** The small file pill shown in the composer and in the sent message. */
export function FileChip({ name, size, onRemove }: { name: string; size?: number; onRemove?: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1 text-[12.5px] text-fg">
      <Icon name="file" className="h-[14px] w-[14px] shrink-0 text-muted" />
      <span className="min-w-0 truncate">{name}</span>
      {size != null && <span className="shrink-0 text-faint">{fileSize(size)}</span>}
      {onRemove && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onRemove() }} aria-label={`Remove ${name}`} className="-mr-1 grid h-5 w-5 shrink-0 place-items-center rounded-full text-faint hover:bg-line hover:text-fg">
          <Icon name="close" className="h-[12px] w-[12px]" />
        </button>
      )}
    </span>
  )
}

// Masked text as plain text nodes, with each [CATEGORY] shown as a pill. Never HTML.
const MARK = /(\[[A-Z][A-Z_]*\]|\[SECRET_[A-Z0-9]+\]|\[instruction removed\])/
function MaskedText({ text }: { text: string }) {
  return (
    <>
      {text.split(MARK).map((part, i) => (i % 2 ? <span key={i} className="tok">{part}</span> : <Fragment key={i}>{part}</Fragment>))}
    </>
  )
}

/** What the gateway read from a file, what it hid, and the redacted pages. */
export function AttachmentCard({ attachment: a, stopped }: { attachment: AttachmentSummary; stopped?: boolean }) {
  const [showText, setShowText] = useState(false)
  const [page, setPage] = useState<AttachmentSummary['redacted_pages'][number] | null>(null)
  const found = Object.entries(a.found).filter(([k]) => k !== 'pages' && k !== 'ocr_pages')
  const kind = a.kind === 'pdf' ? `PDF · ${a.pages} ${a.pages === 1 ? 'page' : 'pages'}` : 'Photo'
  return (
    <div className="mt-4 rounded-[16px] border border-line bg-surface/70 p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
        <Icon name="shield" className="h-[15px] w-[15px]" />
        <span className="min-w-0 truncate font-medium text-fg">{a.name}</span>
        <span>{kind}{a.ocr_pages ? ` · read on this gateway (${a.ocr_pages} by OCR)` : ' · read on this gateway'}</span>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-muted">
        {stopped
          ? 'The gateway stopped this request, so nothing from the file reached the model.'
          : found.length
          ? 'Sensitive values found in the file were hidden before anything reached the model.'
          : a.warnings?.length ? 'Nothing sensitive was found in the text that could be read.' : 'Nothing sensitive was found in the file.'}
        {a.truncated && ' Only the first part of a long file was used.'}
      </p>
      {a.warnings?.map((w) => (
        <p key={w} role="alert" className="mt-2 rounded-[10px] bg-surface-2 px-3 py-2 text-[12.5px] leading-relaxed text-fg">{w}</p>
      ))}
      {found.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Found in the file">
          {found.map(([category, n]) => (
            <li key={category} className="tag">
              {label(category)} ×{n}{a.removed[category] ? ' · removed' : ' · masked'}
            </li>
          ))}
        </ul>
      )}
      {a.redacted_pages.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-3" aria-label="Redacted pages">
          {a.redacted_pages.map((p) => (
            <li key={p.page}>
              <button type="button" onClick={() => setPage(p)} className="block overflow-hidden rounded-[10px] border border-line bg-white transition hover:-translate-y-0.5 hover:shadow-[var(--shadow)]" aria-label={`Open redacted page ${p.page}`}>
                <img src={p.image} alt={`Page ${p.page} with sensitive values blacked out`} className="h-28 w-auto max-w-[200px] object-contain" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => setShowText((v) => !v)} aria-expanded={showText} className="btn btn-ghost btn-sm">
          <Icon name="eye" className="h-[14px] w-[14px]" />
          {showText ? 'Hide masked text' : 'View masked text'}
        </button>
      </div>
      {showText && (
        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-[10px] bg-surface-2 p-3 font-mono text-[12px] leading-relaxed text-fg">
          <MaskedText text={a.masked_text.trim()} />
        </pre>
      )}
      <Modal open={!!page} onClose={() => setPage(null)} label="Redacted page">
        {page && (
          <div className="p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[14px] font-medium">Page {page.page}, redacted</p>
              <button type="button" className="icon-btn" onClick={() => setPage(null)} aria-label="Close"><Icon name="close" /></button>
            </div>
            <img src={page.image} alt={`Page ${page.page} with sensitive values blacked out`} className="mt-3 w-full rounded-[10px] border border-line bg-white" />
            <a href={page.image} download={`${a.name.replace(/\.[^.]+$/, '')}-redacted-p${page.page}.png`} className="btn btn-primary btn-sm mt-4 inline-flex">
              Download redacted
            </a>
          </div>
        )}
      </Modal>
    </div>
  )
}
