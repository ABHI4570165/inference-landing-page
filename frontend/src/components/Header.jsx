import { ORG, Logo } from './PublicShell'

// Fixed header for the original public application forms (which offset their
// content with pt-28). Branding is M H Foundation ONLY — the recruitment
// company's logo that used to sit on the right has been removed, so no public
// page carries a client company's mark.
export default function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-surface-200 shadow-sm">
      <div className="max-w-4xl mx-auto px-4 py-3">

        {/* Desktop: logo + org name on the left, portal title on the right */}
        <div className="hidden sm:flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Logo alt={ORG.name} className="w-12 h-12 object-contain rounded-full flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="font-heading text-[18px] font-bold text-brand-800 leading-tight truncate">
                {ORG.name}
              </h1>
            </div>
          </div>
          <p className="text-[12px] font-semibold text-ink-500 tracking-wider uppercase flex-shrink-0">
            {ORG.portal}
          </p>
        </div>

        {/* Mobile: logo + name on one row, portal title beneath */}
        <div className="flex flex-col items-center gap-1.5 sm:hidden">
          <div className="flex items-center gap-2.5">
            <Logo alt={ORG.name} className="w-10 h-10 object-contain rounded-full flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="font-heading text-[16px] font-bold text-brand-800 leading-tight">{ORG.name}</h1>
            </div>
          </div>
          <p className="text-[10.5px] font-semibold text-ink-500 tracking-wider uppercase">{ORG.portal}</p>
        </div>

      </div>
    </header>
  )
}
