export default function Footer() {
  return (
    <footer className="fixed bottom-0 left-0 right-0 z-50 bg-brand-800 text-white">
      <div className="max-w-4xl mx-auto px-4 py-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-1 text-sm">
          <div className="text-center sm:text-left">
            <p className="font-heading font-bold text-sm">Mandi Hariyanna Academy</p>
            <p className="text-brand-300 text-xs mt-0.5">Empowering students since 2010</p>
          </div>
          <div className="text-brand-300 text-xs text-center">
            <p>© {new Date().getFullYear()} All rights reserved.</p>
            <p className="mt-0.5">
              For queries:{' '}
              <a href="mailto:mhskill2024@gmail.com" className="underline hover:text-white">
                mhskill2024@gmail.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}