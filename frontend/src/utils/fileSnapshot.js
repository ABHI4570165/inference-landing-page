// Android upload hardening shared by both application forms.
//
// On Android, <input type="file"> usually returns a File backed by a
// content:// URI (Google Drive, Files app, Samsung My Files). The browser
// does NOT read the bytes when the file is picked — it re-opens the URI when
// the form is SUBMITTED. If the provider has invalidated the handle by then
// (Drive file not downloaded locally, picker app evicted from memory, file
// re-synced or modified), Chrome aborts the request inside the browser with
// net::ERR_UPLOAD_FILE_CHANGED. Axios reports that as a generic "Network
// Error" with no response, and nothing ever reaches the backend.
//
// Reading the bytes into memory at pick time detaches the upload from the
// content:// provider, so submit always sends a stable in-memory copy.

const EXT_BY_MIME = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
}

// Blob.arrayBuffer() is missing on older Android WebViews — fall back to FileReader
function readBytes(file) {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'))
    reader.readAsArrayBuffer(file)
  })
}

// Multipart filename hygiene: some Android pickers hand over names with no
// extension or characters that can confuse multipart parsing
function safeName(file) {
  const base = (file.name || 'resume').replace(/[^\w.\- ]+/g, '_').slice(-100)
  if (/\.(pdf|doc|docx)$/i.test(base)) return base
  const ext = EXT_BY_MIME[file.type]
  return ext ? `${base}.${ext}` : base
}

// Returns an in-memory File safe to upload at any later time.
// Throws if the file cannot be read RIGHT NOW — callers should tell the user
// to re-pick immediately instead of letting the submit fail later.
export async function snapshotResumeFile(file) {
  const bytes = await readBytes(file)
  try {
    return new File([bytes], safeName(file), {
      type: file.type || 'application/octet-stream'
    })
  } catch {
    // Ancient WebView without the File constructor — keep the original
    // behavior rather than breaking the upload entirely
    return file
  }
}
