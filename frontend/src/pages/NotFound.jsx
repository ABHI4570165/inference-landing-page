import Header from '../components/Header'
import { PublicFooter } from '../components/PublicShell'

// Shown when a visitor lands on "/" or an unknown URL without ever having
// opened one of the application forms. Deliberately links to NO form —
// applicants must use the exact link shared with them.
export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center p-6 pt-28 pb-10">
        <div className="card max-w-md w-full text-center py-10 px-6 sm:px-8">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="font-heading text-2xl font-bold text-gray-800 mb-2">Page Not Available</h2>
          <p className="text-gray-500 text-sm">
            This page doesn't exist or can't be accessed directly.<br />
            Please use the application link that was shared with you.
          </p>
        </div>
      </main>
      <PublicFooter />
    </div>
  )
}
