export default function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-4xl mx-auto px-4 py-3">

        {/* Desktop layout: logo left | title centre | logo right */}
        <div className="hidden sm:flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-shrink-0">
            <img src="/mandi-logo.png" alt="Mandi Hariyanna Academy" className="w-12 h-12 object-contain rounded-full" />
            <div>
              <h1 className="font-heading text-base font-bold text-brand-800 leading-tight">Mandi Hariyanna</h1>
              <p className="text-xs text-gray-500">MANDI HARISH FOUNDATION®</p>
            </div>
          </div>
          <div className="text-center flex-1">
            <p className="text-sm font-semibold text-gray-600 tracking-wide uppercase">Student Hiring Portal</p>
          </div>
          <div className="flex-shrink-0">
            <img src="/inference-logo.png" alt="Inference Labs" className="h-10 w-auto object-contain" />
          </div>
        </div>

        {/* Mobile layout: stacked vertically */}
        <div className="flex flex-col items-center gap-2 sm:hidden">
          {/* Row 1: Mandi logo + name */}
          <div className="flex items-center gap-3">
            <img src="/mandi-logo.png" alt="Mandi Hariyanna Academy" className="w-10 h-10 object-contain rounded-full" />
            <div>
              <h1 className="font-heading text-sm font-bold text-brand-800 leading-tight">Mandi Hariyanna</h1>
              <p className="text-xs text-gray-500">MANDI HARISH FOUNDATION®</p>
            </div>
          </div>
          {/* Row 2: Portal title */}
          <p className="text-xs font-semibold text-gray-600 tracking-wide uppercase">Student Hiring Portal</p>
          {/* Row 3: Inference Labs logo */}
          <img src="/inference-logo.png" alt="Inference Labs" className="h-8 w-auto object-contain" />
        </div>

      </div>
    </header>
  )
}