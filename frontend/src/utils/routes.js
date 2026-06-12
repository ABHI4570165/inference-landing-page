// Unguessable application routes — applicants can only reach a form through
// the exact link shared with them (official college channel vs Instagram
// campaign). Change a token here to instantly rotate that link everywhere.
export const OFFICIAL_FORM_PATH      = '/apply/ofc-x7k2m9q4w1'
export const OFFICIAL_THANKYOU_PATH  = '/thanks/ofc-x7k2m9q4w1'

export const INSTAGRAM_FORM_PATH     = '/apply/ig-p5n8r3t6v2'
export const INSTAGRAM_THANKYOU_PATH = '/thanks/ig-p5n8r3t6v2'

// Remember which form the visitor last opened so that hitting "/" (or any
// unknown URL) sends them back to THEIR form — official visitors never see
// the Instagram form and vice versa.
const LAST_FORM_KEY = 'last_form_source'

export function rememberFormSource(source) {
  try { localStorage.setItem(LAST_FORM_KEY, source) } catch { /* storage unavailable */ }
}

export function getLastFormSource() {
  try { return localStorage.getItem(LAST_FORM_KEY) } catch { return null }
}
