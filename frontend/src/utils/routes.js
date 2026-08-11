// Unguessable application routes — applicants can only reach a form through
// the exact link shared with them (official college channel vs Instagram
// campaign). Change a token here to instantly rotate that link everywhere.
export const OFFICIAL_FORM_PATH      = '/apply/ofc-x7k2m9q4w1'
export const OFFICIAL_THANKYOU_PATH  = '/thanks/ofc-x7k2m9q4w1'

export const INSTAGRAM_FORM_PATH     = '/apply/ig-p5n8r3t6v2'
export const INSTAGRAM_THANKYOU_PATH = '/thanks/ig-p5n8r3t6v2'

// Missed Test form — for students who could not visit/attend the test
export const MISSED_TEST_FORM_PATH     = '/apply/mt-k4j7w2n9x5'
export const MISSED_TEST_THANKYOU_PATH = '/thanks/mt-k4j7w2n9x5'

// Counselling assessment — opened via QR code; students verify with their
// registered name/email/mobile, so the path itself can stay friendly.
// The bare path (no token) is the ORIGINAL link, already printed/circulated
// before workspaces existed — it always resolves to the default-intake
// workspace and keeps working forever. Every workspace (including new ones)
// additionally gets its own unguessable /counselling/:token and
// /reception/:token link — see Workspace.receptionToken/counsellingToken.
export const COUNSELLING_FORM_PATH = '/counselling'
export const COUNSELLING_FORM_PATH_TOKEN = `${COUNSELLING_FORM_PATH}/:token`
export const RECEPTION_PATH = '/reception'
export const RECEPTION_PATH_TOKEN = `${RECEPTION_PATH}/:token`

// Custom Forms module — one public submission page per form.
export const FORM_PATH = '/form/:publicSlug'
export function formUrlFor(publicSlug) { return `/form/${publicSlug}` }
export function receptionUrlFor(token) { return `${RECEPTION_PATH}/${token}` }
export function counsellingUrlFor(token) { return `${COUNSELLING_FORM_PATH}/${token}` }

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

// Admin panel: move from "/admin" to an unguessable URL. Change this once
// here and the whole app will follow.
export const ADMIN_BASE = '/adm-3e9f7b2c'
export const ADMIN_LOGIN = `${ADMIN_BASE}/login`
// Level 1 — global landing: greeting + recruitment workspace cards + "Create Workspace"
export const ADMIN_HOME = `${ADMIN_BASE}/home`
// Level 2 — the selected workspace's own dashboard (greeting/stats/charts, scoped to it)
export const ADMIN_WORKSPACE_DASHBOARD = `${ADMIN_BASE}/workspace-dashboard`
export const ADMIN_DASHBOARD = `${ADMIN_BASE}/dashboard`
export const ADMIN_COLLEGES = `${ADMIN_BASE}/colleges`
export const ADMIN_ATTENDANCE = `${ADMIN_BASE}/attendance`
export const ADMIN_ATTENDANCE_HISTORY = `${ADMIN_BASE}/attendance/history`
export const ADMIN_COUNSELLING = `${ADMIN_BASE}/counselling`
export const ADMIN_COUNSELLING_RESPONSES = `${ADMIN_COUNSELLING}/responses`
export const ADMIN_COUNSELLING_DETAIL = `${ADMIN_COUNSELLING}/responses/:id`
export const ADMIN_COUNSELLING_QUESTIONS = `${ADMIN_COUNSELLING}/questions`
export const ADMIN_RECEPTION = `${ADMIN_BASE}/reception`
export const ADMIN_FORMS = `${ADMIN_BASE}/forms`
export const ADMIN_FORM_EDIT = `${ADMIN_FORMS}/:formId/edit`
export const ADMIN_FORM_RESPONSES = `${ADMIN_FORMS}/:formId/responses`
