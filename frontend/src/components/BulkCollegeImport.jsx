import { useState, useEffect, useMemo, useRef } from 'react'
import API from '../utils/api'
import Spinner from './Spinner'
import { IconClose, IconCheckCircle, IconBuilding, IconUpload, IconDownload, IconType } from './Icons'

// Bulk college import for the case that actually hurts: a hundred colleges that
// would otherwise be typed one at a time.
//
// Two ways in — upload a spreadsheet, or paste text — both feeding the same
// preview table. The parse runs in the browser and is shown back before
// anything is written, because a silent import of a mis-read sheet is far worse
// than a slow one. The server re-normalises everything and remains the
// authority on duplicates.

const SAMPLE = `RV College of Engineering, 1RV, Bengaluru, Mysore Road
BMS College of Engineering, 1BM, Bengaluru, Bull Temple Road
PES University, 1PE, Bengaluru, 100 Feet Ring Road`

const clean = v => String(v == null ? '' : v).trim().replace(/\s+/g, ' ')
const upper = v => clean(v).toUpperCase()

/* ── Text parsing ──────────────────────────────────────────────────
   Split on tab first (spreadsheet paste), else comma. Order is
   name, code, location, address — everything after the third separator
   is one address, so addresses containing commas survive intact.
   Only the name is required; the rest may be left empty. The preview
   table is what catches a list pasted in a different order. */
function parseLine(line) {
  const raw = line.trim()
  if (!raw) return null
  const parts = raw.includes('\t') ? raw.split('\t') : raw.split(',')
  const name = clean(parts[0])
  if (!name) return null
  return {
    name: name.toUpperCase(),
    code: upper(parts[1]),
    location: clean(parts[2]),
    address: clean(parts.slice(3).join(', '))
  }
}

/* ── Spreadsheet parsing ───────────────────────────────────────────
   Headings are matched by meaning rather than exact text, so "College",
   "College Name", "Institution", "City" and "Place" all land in the right
   column and the columns may appear in any order. A sheet with no
   recognisable heading row falls back to positional reading. */
const HEADER_ALIASES = {
  name:     ['college name', 'college', 'name', 'institution', 'institute', 'college/institution'],
  code:     ['college code', 'code', 'clg code', 'college id', 'institution code', 'univ code'],
  location: ['location', 'city', 'place', 'town', 'district'],
  address:  ['address', 'full address', 'street', 'postal address']
}

function resolveColumns(headerCells) {
  const map = { name: -1, code: -1, location: -1, address: -1 }
  headerCells.forEach((raw, i) => {
    const h = clean(raw).toLowerCase()
    if (!h) return
    for (const key of Object.keys(map)) {
      if (map[key] === -1 && HEADER_ALIASES[key].includes(h)) map[key] = i
    }
  })
  return map
}

async function parseWorkbook(file) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())

  // First sheet that actually has rows — the template's "How to use" sheet
  // must never be mistaken for data.
  const sheet = wb.worksheets.find(s => s.rowCount > 1 && !/how to use|instructions|readme/i.test(s.name))
    || wb.worksheets[0]
  if (!sheet) throw new Error('That file has no sheets.')

  const rows = []
  sheet.eachRow({ includeEmpty: false }, row => {
    // .values is 1-based with a leading hole; text handles formulas and links
    const cells = []
    row.eachCell({ includeEmpty: true }, (cell, col) => { cells[col - 1] = cell.text })
    rows.push(cells)
  })
  if (!rows.length) throw new Error('That sheet is empty.')

  const cols = resolveColumns(rows[0] || [])
  const hasHeader = cols.name !== -1
  const idx = hasHeader ? cols : { name: 0, code: 1, location: 2, address: 3 }
  const body = hasHeader ? rows.slice(1) : rows

  const out = []
  for (const cells of body) {
    const name = clean(cells[idx.name])
    if (!name) continue
    out.push({
      name: name.toUpperCase(),
      code: idx.code > -1 ? upper(cells[idx.code]) : '',
      location: idx.location > -1 ? clean(cells[idx.location]) : '',
      address: idx.address > -1 ? clean(cells[idx.address]) : ''
    })
  }
  return { rows: out, sheetName: sheet.name, hasHeader }
}

/* ── Downloadable template ─────────────────────────────────────────
   Generated on demand so it always matches what the importer expects. */
async function downloadTemplate() {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Colleges', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = [
    { header: 'College Name', key: 'name', width: 46 },
    { header: 'College Code', key: 'code', width: 16 },
    { header: 'Location', key: 'location', width: 18 },
    { header: 'Address', key: 'address', width: 62 }
  ]
  ws.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F7A4D' } }
    cell.alignment = { vertical: 'middle', indent: 1 }
  })
  ws.getRow(1).height = 24
  ;[
    ['RV College of Engineering', '1RV', 'Bengaluru', 'Mysore Road, RV Vidyaniketan Post, Bengaluru 560059'],
    ['BMS College of Engineering', '1BM', 'Bengaluru', 'Bull Temple Road, Basavanagudi, Bengaluru 560019'],
    ['PES University', '1PE', 'Bengaluru', '100 Feet Ring Road, BSK III Stage, Bengaluru 560085']
  ].forEach(r => ws.addRow(r).eachCell(c => { c.alignment = { indent: 1 } }))

  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'College-List-Template.xlsx'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 30000)
}

export default function BulkCollegeImport({ existing, onClose, onImported }) {
  const [mode, setMode] = useState('file')      // 'file' | 'paste'
  const [text, setText] = useState('')
  const [fileRows, setFileRows] = useState(null)
  const [fileMeta, setFileMeta] = useState(null)
  const [reading, setReading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  // Names already in the workspace, compared case-insensitively — the existing
  // list keeps its original casing and is never modified.
  const existingUpper = useMemo(
    () => new Set((existing || []).map(c => upper(c.name))),
    [existing]
  )

  const parsed = useMemo(() => {
    const source = mode === 'file'
      ? (fileRows || [])
      : text.split(/\r?\n/).map(parseLine).filter(Boolean)

    const seen = new Set()
    return source.map(row => {
      const duplicate = existingUpper.has(row.name) || seen.has(row.name)
      seen.add(row.name)
      return { ...row, duplicate }
    })
  }, [mode, fileRows, text, existingUpper])

  const fresh = parsed.filter(r => !r.duplicate)
  const dupes = parsed.length - fresh.length

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setReading(true)
    setError('')
    setFileRows(null)
    setFileMeta(null)
    try {
      const { rows, sheetName, hasHeader } = await parseWorkbook(file)
      if (!rows.length) {
        setError('No college names found in that sheet. Check that a column is headed “College Name”.')
      } else {
        setFileRows(rows)
        setFileMeta({ fileName: file.name, sheetName, hasHeader, count: rows.length })
      }
    } catch (err) {
      setError(err?.message || 'Could not read that file. Please upload an .xlsx spreadsheet.')
    } finally {
      setReading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

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

  const tab = (id, label, Icon) => (
    <button
      type="button"
      onClick={() => { setMode(id); setError('') }}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13.5px] font-medium border transition-all duration-200
                  ${mode === id
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-ink-600 border-surface-300 hover:border-brand-300 hover:text-brand-700'}`}
    >
      <Icon size={15} /> {label}
    </button>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/50 animate-fade-in"
      onClick={() => !busy && onClose()}>
      <div className="bg-white rounded-2xl shadow-panel w-full max-w-3xl max-h-[90vh] flex flex-col animate-scale-in"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-surface-200">
          <div>
            <h3 className="font-heading text-lg font-bold text-ink-900">Import Colleges</h3>
            <p className="text-[13px] text-ink-500 mt-0.5">
              Upload a spreadsheet or paste a list. Nothing is saved until you confirm.
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
                  {result.skipped > result.skippedNames.length
                    ? ` +${result.skipped - result.skippedNames.length} more` : ''}
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                {tab('file', 'Upload Excel', IconUpload)}
                {tab('paste', 'Paste list', IconType)}
                <button type="button" onClick={downloadTemplate}
                  className="btn-secondary !py-2 !px-3 text-[13px] ml-auto">
                  <IconDownload size={14} /> Download template
                </button>
              </div>

              {mode === 'file' ? (
                <div>
                  <label className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed
                                     px-6 py-10 text-center cursor-pointer transition-colors duration-200
                                     ${reading ? 'border-surface-300 bg-surface-50' : 'border-surface-300 hover:border-brand-400 hover:bg-brand-50/40'}`}>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className="hidden"
                      onChange={handleFile}
                      disabled={reading}
                    />
                    <div className="w-11 h-11 rounded-xl bg-white ring-1 ring-surface-200 flex items-center justify-center">
                      <IconUpload size={19} className="text-brand-700" />
                    </div>
                    {reading ? (
                      <p className="flex items-center gap-2 text-[13.5px] text-ink-500"><Spinner /> Reading sheet…</p>
                    ) : (
                      <>
                        <p className="text-[14px] font-medium text-ink-800">Choose an Excel file</p>
                        <p className="text-[12.5px] text-ink-400">
                          .xlsx with columns College Name, College Code, Location, Address
                        </p>
                      </>
                    )}
                  </label>

                  {fileMeta && (
                    <p className="text-[12.5px] text-ink-500 mt-3">
                      Read <span className="font-semibold text-ink-800">{fileMeta.count}</span> row
                      {fileMeta.count === 1 ? '' : 's'} from <span className="font-semibold text-ink-800">{fileMeta.fileName}</span>
                      {' '}· sheet “{fileMeta.sheetName}”
                      {!fileMeta.hasHeader && ' · no headings found, read the first three columns in order'}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <label className="form-label">Paste your list</label>
                  <textarea
                    className="form-input font-mono text-[13px]"
                    rows={8}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder={SAMPLE}
                    spellCheck="false"
                  />
                  <p className="form-hint">
                    One per line: name, code, location, address — separated by a comma or a tab.
                    Only the name is required. Check the preview below before adding.
                  </p>
                </>
              )}

              {parsed.length > 0 && (
                <div className="mt-5">
                  <p className="text-[13px] font-semibold text-ink-800 mb-2">
                    Preview — {fresh.length} to add
                    {dupes > 0 && <span className="text-ink-400 font-normal"> · {dupes} already present</span>}
                  </p>
                  <div className="border border-surface-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto scroll-slim">
                    <table className="data-table">
                      <thead>
                        <tr><th>College Name</th><th>Code</th><th>Location</th><th>Address</th><th></th></tr>
                      </thead>
                      <tbody>
                        {parsed.slice(0, 200).map((r, i) => (
                          <tr key={i} className={r.duplicate ? 'opacity-45' : ''}>
                            <td className="font-medium">{r.name}</td>
                            <td>{r.code || <span className="text-ink-300">—</span>}</td>
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

              {parsed.length === 0 && mode === 'paste' && text.trim() && (
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
                {busy
                  ? <><Spinner /> Importing…</>
                  : <><IconBuilding size={15} /> Add {fresh.length || ''} college{fresh.length === 1 ? '' : 's'}</>}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
