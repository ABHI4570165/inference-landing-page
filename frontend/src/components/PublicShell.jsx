// ── Public-facing brand shell ───────────────────────────────────────────────
// Every page a candidate can reach carries M H Foundation branding and nothing
// else. The recruitment company that owns the workspace is deliberately NOT
// represented here — no company logo, no company footer — regardless of which
// workspace the form belongs to. The workspace's identity reaches the
// candidate only through the form's own title/description.
//
// Single source of truth for the public-facing brand. Every header, footer and
// favicon reads from here, so the logo or wording changes in one place.

const ORG = {
  logo: '/logo-white.svg',
  name: 'M H Foundation®',
  portal: 'Student Hiring Portal',
  email: 'mhskill2024@gmail.com'
}

export function PublicHeader() {
  return (
    <header className="bg-white border-b border-surface-200 sticky top-0 z-30">
      <div className="mx-auto w-full max-w-[920px] px-5 sm:px-8">
        <div className="flex items-center justify-between gap-4 py-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={ORG.logo}
              alt={ORG.name}
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-full object-contain flex-shrink-0"
            />
            <div className="min-w-0">
              <p className="font-heading text-[16px] sm:text-[18px] font-bold text-brand-800 leading-tight truncate">
                {ORG.name}
              </p>
            </div>
          </div>
          <p className="text-[10px] sm:text-[12px] font-semibold text-ink-500 tracking-wider uppercase text-right flex-shrink-0">
            {ORG.portal}
          </p>
        </div>
      </div>
    </header>
  )
}

export function PublicFooter() {
  return (
    <footer className="bg-brand-900 text-white mt-auto">
      <div className="mx-auto w-full max-w-[920px] px-5 sm:px-8 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex items-center gap-3 justify-center sm:justify-start">
            <img src={ORG.logo} alt="" className="w-9 h-9 rounded-full object-contain bg-white/95 p-0.5 flex-shrink-0" />
            <p className="font-heading font-bold text-[15px] leading-tight">{ORG.name}</p>
          </div>
          <div className="text-brand-300 text-[12px] sm:text-right leading-relaxed">
            <p>© {new Date().getFullYear()} All rights reserved.</p>
            <p className="mt-0.5">
              For queries:{' '}
              <a href={`mailto:${ORG.email}`} className="underline underline-offset-2 hover:text-white transition-colors">
                {ORG.email}
              </a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}

// Full-height page frame: header, centred content column, footer pinned to the
// bottom on short pages. Used by every public form so the shell is identical
// while the form's own fields stay entirely dynamic.
export default function PublicShell({ children }) {
  return (
    <div className="min-h-screen bg-surface-100 flex flex-col">
      <PublicHeader />
      <main className="flex-1 w-full">
        <div className="mx-auto w-full max-w-[920px] px-4 sm:px-8 py-6 sm:py-10">
          {children}
        </div>
      </main>
      <PublicFooter />
    </div>
  )
}

export { ORG }
