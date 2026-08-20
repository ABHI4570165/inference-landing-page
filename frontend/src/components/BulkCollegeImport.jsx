import { useState, useEffect, useMemo } from 'react'
import API from '../utils/api'
import Spinner from './Spinner'
import { IconClose, IconCheckCircle, IconBuilding } from './Icons'

// Paste-based import for the case that actually hurts: a hundred colleges that
// would otherwise be typed one at a time. One college per line; name, location
// and address separated by a comma or a tab — so a column copied straight out
// of Excel or Google Sheets pastes in without reformatting.
//
// The parse runs in the browser and is shown back as a preview, because a
// silent import of a mis-split list is far worse than a slow one. The server
// re-normalises everything and is the authority on duplicates.

const SAMPLE = `RV College of Engineering, Bengaluru, Mysore Road
BMS College of Engineering, Bengaluru, Bull Temple Road
PES University, Bengaluru, 100 Feet Ring Road`

// Split on tab first (spreadsheet paste), else comma. Everything after the
// second separator is treated as one address, so addresses containing commas
// survive intact.
function parseLine(line) {
  const raw = line.trim()
  if (!raw) return null
  const parts = raw.includes('\t') ? raw.split('\t') : raw.split(',')
  const name = (parts[0] || '').trim()
  if (!name) return null
  return {
    name: name.replace(/\s+/g, ' ').toUpperCase(),
    location: (parts[1] || '').trim(),
    address: parts.slice(2).join(', ').trim()
  }
}

export default function BulkCollegeImport({ existing, onClose, onImported }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  // Names already in the workspace, compared case-insensitively — the existing
  // list keeps its original casing and is never modified.
  const existingUpper = useMemo(
    () => new Set((existing || []).map(c => String(c.name).trim().replace(/\s+/g, ' ').toUpperCase())),
    [existing]
  )

  const parsed = useMemo(() => {
    const rows = []
    const seen = new Set()
    for (const line of text.split(/\r?\n/)) {
      const row = parseLine(line)
      if (!row) continue
      row.duplicate = existingUpper.has(row.name) || seen.has(row.name)
      seen.add(row.name)
      rows.push(row)
    }
    return rows
  }, [text, existingUpper])

  const fresh = parsed.filter(r => !r.duplicate)
  const dupes = parsed.length - fresh.length

  async function handleImport() {
    setBusy(true)
    setError('')
    try {
      const res = await API.post('/api/colleges/bulk', { colleges: fresh })
      setResult(res.data)
      onImported(res.data.colleges)
    } catch (err) {
      setError(err.response?.data?.message || 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/50 animate-fade-in"
      onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-2xl shadow-panel w-full max-w-3xl max-h-[90vh] flex flex-col animate-scale-in"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-surface-200">
          <div>
            <h3 className="font-heading text-lg font-bold text-ink-900">Import Colleges</h3>
            <p className="text-[13px] text-ink-500 mt-0.5">
              One per line — name, location, address. Paste straight from a spreadsheet.
            </p>
          </div>
          <button onClick={onClose} disabled={busy} className="icon-btn flex-shrink-0" aria-label="Close">
            <IconClose />
          </button>
        </div>

        <div className="overflow-y-auto scroll-slim px-6 py-5 flex-1">
          {result ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-4">
                <IconCheckCircle size={26} className="text-brand-600" />
              </div>
              <p className="font-heading text-lg font-bold text-ink-900 mb-1">
                {result.added} college{result.added === 1 ? '' : 's'} added
              </p>
              <p className="text-[13.5px] text-ink-500">
                {result.skipped > 0
                  ? `${result.skipped} skipped — already in your list.`
                  : 'Everything in your list was new.'}
              </p>
              {result.skippedNames?.length > 0 && (
                <p className="text-[12px] text-ink-400 mt-3 max-w-lg mx-auto">
                  Skipped: {result.skippedNames.join(', ')}
                  {result.skipped > result.skippedNames.length ? ` +${result.skipped - result.skippedNames.length} more` : ''}
                </p>
              )}
            </div>
          ) : (
            <>
              <label className="form-label">Paste your list</label>
              <textarea
                className="form-input font-mono text-[13px]"
                rows={9}
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={SAMPLE}
                spellCheck="false"
              />
              <p className="form-hint">
                Separate with a comma or a tab. Location and address are optional.
                Names are saved in capitals automatically.
              </p>

              {parsed.length > 0 && (
                <div className="mt-5">
                  <div className="flex items-baseline justify-between gap-3 mb-2">
                    <p className="text-[13px] font-semibold text-ink-800">
                      Preview — {fresh.length} to add
                      {dupes > 0 && <span className="text-ink-400 font-normal"> · {dupes} already present</span>}
                    </p>
                  </div>
                  <div className="border border-surface-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto scroll-slim">
                    <table className="data-table">
                      <thead>
                        <tr><th>College Name</th><th>Location</th><th>Address</th><th></th></tr>
                      </thead>
                      <tbody>
                        {parsed.slice(0, 200).map((r, i) => (
                          <tr key={i} className={r.duplicate ? 'opacity-45' : ''}>
                            <td className="font-medium">{r.name}</td>
                            <td>{r.location || <span className="text-ink-300">—</span>}</td>
                            <td className="max-w-[220px]">
                              <span className="block truncate" title={r.address}>
                                {r.address || <span className="text-ink-300">—</span>}
                              </span>
                            </td>
                            <td className="text-right">
                              {r.duplicate && <span className="badge badge-neutral">Exists</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {parsed.length > 200 && (
                    <p className="text-[12px] text-ink-400 mt-2">
                      Showing the first 200 of {parsed.length} — all of them will be imported.
                    </p>
                  )}
                </div>
              )}

              {parsed.length === 0 && text.trim() && (
                <p className="text-[13px] text-ink-400 mt-4">Nothing readable yet — check the separators.</p>
              )}

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5 mt-4">{error}</p>
              )}
            </>
          )}
        </div>

        <div className="flex gap-3 justify-end px-6 py-4 border-t border-surface-200">
          {result ? (
            <button className="btn-primary" onClick={onClose}>Done</button>
          ) : (
            <>
              <button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
              <button className="btn-primary" onClick={handleImport} disabled={busy || fresh.length === 0}>
                {busy ? <><Spinner /> Importing…</> : <><IconBuilding size={15} /> Add {fresh.length || ''} college{fresh.length === 1 ? '' : 's'}</>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
