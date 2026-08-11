import { Navigate, useLocation } from 'react-router-dom'
import Header from './Header'
import { PublicFooter as FooterInline } from './PublicShell'


// Shared thank-you layout. Each application source gets its own page (and its
// own WhatsApp group link) wrapping this component. Direct URL access without
// an actual submission redirects back to the source's form — the page is only
// reachable through a real form submission.
export default function ThankYouPage({ whatsappLink, formPath }) {
  const location = useLocation()

  if (!location.state?.submitted) {
    return <Navigate to={formPath} replace />
  }

  const submittedRole = location.state.role || ''

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex items-center justify-center p-6 pt-28 pb-10">
        <div className="card max-w-lg w-full text-center py-10 px-6 sm:px-8">
          <div className="w-16 h-16 rounded-full bg-brand-100 flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="font-heading text-2xl font-bold text-brand-800 mb-2">Application Submitted!</h2>
          <p className="text-gray-600 mb-2">
            Thank you for applying. Our team will review your application and get in touch with you soon.
          </p>
          {submittedRole && (
            <span className="inline-block mt-1 mb-6 px-3 py-1 rounded-full text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-200">
              Applied for: {submittedRole}
            </span>
          )}

          <div className="border-t border-gray-100 my-6" />

          {/* WhatsApp CTA */}
          <div className="relative bg-green-50 border-2 border-green-400 rounded-xl p-5 overflow-hidden">
            <span className="absolute top-3 right-3 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
            </span>
            <div className="flex items-center justify-center gap-2 mb-2">
              <svg className="w-6 h-6 text-green-600 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              <span className="font-bold text-green-800 text-base">Join Our WhatsApp Group</span>
            </div>
            <p className="text-green-700 text-sm mb-4">
              Stay updated on interview schedules &amp; next steps.<br />
              <strong>Don't miss out — join now!</strong>
            </p>
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{ animationDuration: '1.2s' }}
              className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-600 active:scale-95
                         text-white font-bold text-sm px-6 py-3 rounded-lg shadow-lg shadow-green-200
                         animate-bounce transition-all duration-150"
            >
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              👉 Join WhatsApp Group Now
            </a>
            <p className="text-green-600 text-xs mt-3 italic">Tap the button above to join instantly</p>
          </div>
        </div>
      </main>
      <FooterInline />
    </div>
  )
}
