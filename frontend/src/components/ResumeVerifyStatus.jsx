// Verification status shown under the resume file input on both application
// forms. The file bytes are read into memory at selection time (see
// utils/fileSnapshot.js) so applicants find out IMMEDIATELY whether their
// file is truly accessible, instead of hitting a fake "Network error" after
// filling the whole form.

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  return `${(bytes / 1024).toFixed(1)} KB`
}

export default function ResumeVerifyStatus({ status, file }) {
  if (status === 'verifying') {
    return <p className="text-gray-500 text-xs mt-2">Verifying resume file…</p>
  }

  if (status === 'verified' && file) {
    return (
      <div className="mt-2 bg-green-50 border border-green-200 rounded-lg p-3 text-green-800 text-xs space-y-0.5">
        <p className="font-semibold text-sm">✅ Resume verified successfully</p>
        <p>File: {file.name}</p>
        <p>Size: {formatSize(file.size)}</p>
        <p>Type: {file.type || 'document'}</p>
        <p className="font-medium">Ready for submission</p>
      </div>
    )
  }

  if (status === 'failed') {
    return (
      <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-xs space-y-0.5">
        <p className="font-semibold text-sm">❌ Unable to access this file.</p>
        <p>Please save the file to your device and select it again.</p>
      </div>
    )
  }

  return null
}
