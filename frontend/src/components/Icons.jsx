// Small hand-rolled line icons — matches the app's existing "no chart/icon
// library" approach (see Charts.jsx). Kept minimal: only what Global Home
// and its sidebar actually use.
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }

export const IconHome = p => (
  <svg viewBox="0 0 24 24" width={p.size || 18} height={p.size || 18} {...base} className={p.className}>
    <path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9" />
  </svg>
)
export const IconBuilding = p => (
  <svg viewBox="0 0 24 24" width={p.size || 18} height={p.size || 18} {...base} className={p.className}>
    <rect x="4" y="3" width="10" height="18" rx="1" /><rect x="16" y="8" width="4" height="13" rx="1" />
    <path d="M7 7h1M11 7h1M7 11h1M11 11h1M7 15h1M11 15h1" />
  </svg>
)
export const IconSwitch = p => (
  <svg viewBox="0 0 24 24" width={p.size || 16} height={p.size || 16} {...base} className={p.className}>
    <path d="M4 8h13l-3-3M20 16H7l3 3" />
  </svg>
)
export const IconLogout = p => (
  <svg viewBox="0 0 24 24" width={p.size || 16} height={p.size || 16} {...base} className={p.className}>
    <path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" />
  </svg>
)
export const IconChevronDown = p => (
  <svg viewBox="0 0 24 24" width={p.size || 16} height={p.size || 16} {...base} className={p.className}>
    <path d="M6 9l6 6 6-6" />
  </svg>
)
export const IconRocket = p => (
  <svg viewBox="0 0 24 24" width={p.size || 18} height={p.size || 18} {...base} className={p.className}>
    <path d="M12 15c4-1 7-5 7-10-5 0-9 3-10 7" /><path d="M9 12c-3 1-4 3-5 7 4-1 6-2 7-5" />
    <circle cx="14.5" cy="9.5" r="1.5" /><path d="M9 15l-1.5 1.5M6 18l1-1" />
  </svg>
)
export const IconUsers = p => (
  <svg viewBox="0 0 24 24" width={p.size || 18} height={p.size || 18} {...base} className={p.className}>
    <circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
    <circle cx="17" cy="8" r="2.5" strokeWidth="1.6" /><path d="M15.5 14.2c2.6.4 4.5 2.7 4.5 5.8" />
  </svg>
)
export const IconDocument = p => (
  <svg viewBox="0 0 24 24" width={p.size || 18} height={p.size || 18} {...base} className={p.className}>
    <path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" /><path d="M14 3v4h4" /><path d="M9 13h6M9 17h6" />
  </svg>
)
export const IconCalendar = p => (
  <svg viewBox="0 0 24 24" width={p.size || 15} height={p.size || 15} {...base} className={p.className}>
    <rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M8 3v4M16 3v4M3.5 10h17" />
  </svg>
)
export const IconEye = p => (
  <svg viewBox="0 0 24 24" width={p.size || 16} height={p.size || 16} {...base} className={p.className}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
  </svg>
)
export const IconDots = p => (
  <svg viewBox="0 0 24 24" width={p.size || 18} height={p.size || 18} {...base} className={p.className} fill="currentColor" stroke="none">
    <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
  </svg>
)
export const IconEdit = p => (
  <svg viewBox="0 0 24 24" width={p.size || 15} height={p.size || 15} {...base} className={p.className}>
    <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z" /><path d="M14 6l4 4" />
  </svg>
)
export const IconArrowRight = p => (
  <svg viewBox="0 0 24 24" width={p.size || 15} height={p.size || 15} {...base} className={p.className}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)
export const IconPlus = p => (
  <svg viewBox="0 0 24 24" width={p.size || 16} height={p.size || 16} {...base} className={p.className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)
export const IconCheckCircle = p => (
  <svg viewBox="0 0 24 24" width={p.size || 18} height={p.size || 18} {...base} className={p.className}>
    <circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.3 2.3L16 10" />
  </svg>
)
export const IconCamera = p => (
  <svg viewBox="0 0 24 24" width={p.size || 18} height={p.size || 18} {...base} className={p.className}>
    <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="14" r="3.3" />
  </svg>
)
export const IconGrid = p => (
  <svg viewBox="0 0 24 24" width={p.size || 18} height={p.size || 18} {...base} className={p.className}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </svg>
)
export const IconClipboard = p => (
  <svg viewBox="0 0 24 24" width={p.size || 18} height={p.size || 18} {...base} className={p.className}>
    <path d="M9 4H7a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1h-2" />
    <rect x="9" y="2.5" width="6" height="3.5" rx="1" /><path d="M9 11h6M9 15h4" />
  </svg>
)
export const IconCheckSquare = p => (
  <svg viewBox="0 0 24 24" width={p.size || 18} height={p.size || 18} {...base} className={p.className}>
    <path d="M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h10" /><path d="M8.5 11.5l3 3L21 5" />
  </svg>
)
export const IconHistory = p => (
  <svg viewBox="0 0 24 24" width={p.size || 18} height={p.size || 18} {...base} className={p.className}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" /><path d="M3 4v4h4" /><path d="M12 7.5V12l3 2" />
  </svg>
)
export const IconCompass = p => (
  <svg viewBox="0 0 24 24" width={p.size || 18} height={p.size || 18} {...base} className={p.className}>
    <circle cx="12" cy="12" r="8.5" /><path d="M15.5 8.5l-2 5-5 2 2-5 5-2Z" />
  </svg>
)
export const IconSearch = p => (
  <svg viewBox="0 0 24 24" width={p.size || 16} height={p.size || 16} {...base} className={p.className}>
    <circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" />
  </svg>
)
export const IconFilter = p => (
  <svg viewBox="0 0 24 24" width={p.size || 16} height={p.size || 16} {...base} className={p.className}>
    <path d="M4 5.5h16l-6.2 7.4V19l-3.6-2v-4.1L4 5.5Z" />
  </svg>
)
export const IconDownload = p => (
  <svg viewBox="0 0 24 24" width={p.size || 16} height={p.size || 16} {...base} className={p.className}>
    <path d="M12 4v10m0 0l-3.5-3.5M12 14l3.5-3.5" /><path d="M5 17v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2" />
  </svg>
)
export const IconTrash = p => (
  <svg viewBox="0 0 24 24" width={p.size || 15} height={p.size || 15} {...base} className={p.className}>
    <path d="M4 6.5h16M9.5 6.5V4.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" />
    <path d="M6.5 6.5l.8 13a1 1 0 0 0 1 .9h7.4a1 1 0 0 0 1-.9l.8-13" /><path d="M10.5 10.5v6M13.5 10.5v6" />
  </svg>
)
export const IconLink = p => (
  <svg viewBox="0 0 24 24" width={p.size || 15} height={p.size || 15} {...base} className={p.className}>
    <path d="M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1.2 1.2" />
    <path d="M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1.2-1.2" />
  </svg>
)
export const IconMenu = p => (
  <svg viewBox="0 0 24 24" width={p.size || 20} height={p.size || 20} {...base} className={p.className}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
)
export const IconClose = p => (
  <svg viewBox="0 0 24 24" width={p.size || 18} height={p.size || 18} {...base} className={p.className}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)
export const IconChevronRight = p => (
  <svg viewBox="0 0 24 24" width={p.size || 16} height={p.size || 16} {...base} className={p.className}>
    <path d="M9 6l6 6-6 6" />
  </svg>
)
export const IconChevronLeft = p => (
  <svg viewBox="0 0 24 24" width={p.size || 16} height={p.size || 16} {...base} className={p.className}>
    <path d="M15 6l-6 6 6 6" />
  </svg>
)
export const IconInbox = p => (
  <svg viewBox="0 0 24 24" width={p.size || 18} height={p.size || 18} {...base} className={p.className}>
    <path d="M3.5 13.5h4l1.5 3h6l1.5-3h4" />
    <path d="M5.5 4.5h13l2 9v5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-5l2-9Z" />
  </svg>
)
export const IconSparkle = p => (
  <svg viewBox="0 0 24 24" width={p.size || 16} height={p.size || 16} {...base} className={p.className}>
    <path d="M12 3.5l1.8 4.7L18.5 10l-4.7 1.8L12 16.5l-1.8-4.7L5.5 10l4.7-1.8L12 3.5Z" />
    <path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z" />
  </svg>
)
export const IconType = p => (
  <svg viewBox="0 0 24 24" width={p.size || 16} height={p.size || 16} {...base} className={p.className}>
    <path d="M5 7V5.5h14V7" /><path d="M12 5.5V19" /><path d="M9.5 19h5" />
  </svg>
)
export const IconMail = p => (
  <svg viewBox="0 0 24 24" width={p.size || 16} height={p.size || 16} {...base} className={p.className}>
    <rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="M3.6 7l8.4 6 8.4-6" />
  </svg>
)
export const IconPhone = p => (
  <svg viewBox="0 0 24 24" width={p.size || 16} height={p.size || 16} {...base} className={p.className}>
    <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M10.5 18.5h3" />
  </svg>
)
export const IconHash = p => (
  <svg viewBox="0 0 24 24" width={p.size || 16} height={p.size || 16} {...base} className={p.className}>
    <path d="M5 9.5h14M5 14.5h14M10 4.5L8.5 19.5M15.5 4.5L14 19.5" />
  </svg>
)
export const IconList = p => (
  <svg viewBox="0 0 24 24" width={p.size || 16} height={p.size || 16} {...base} className={p.className}>
    <path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11" /><circle cx="4.8" cy="6.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="4.8" cy="12" r="1.1" fill="currentColor" stroke="none" /><circle cx="4.8" cy="17.5" r="1.1" fill="currentColor" stroke="none" />
  </svg>
)
export const IconRadio = p => (
  <svg viewBox="0 0 24 24" width={p.size || 16} height={p.size || 16} {...base} className={p.className}>
    <circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />
  </svg>
)
export const IconParagraph = p => (
  <svg viewBox="0 0 24 24" width={p.size || 16} height={p.size || 16} {...base} className={p.className}>
    <path d="M4.5 6.5h15M4.5 11h15M4.5 15.5h9" />
  </svg>
)
export const IconUpload = p => (
  <svg viewBox="0 0 24 24" width={p.size || 16} height={p.size || 16} {...base} className={p.className}>
    <path d="M12 16V5.5m0 0L8.5 9M12 5.5L15.5 9" /><path d="M5 17v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2" />
  </svg>
)
export const IconDrag = p => (
  <svg viewBox="0 0 24 24" width={p.size || 16} height={p.size || 16} {...base} className={p.className} fill="currentColor" stroke="none">
    <circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" /><circle cx="9" cy="12" r="1.4" />
    <circle cx="15" cy="12" r="1.4" /><circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" />
  </svg>
)
export const IconCopy = p => (
  <svg viewBox="0 0 24 24" width={p.size || 15} height={p.size || 15} {...base} className={p.className}>
    <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
    <path d="M15.5 5.5H5.5a1 1 0 0 0-1 1v10" />
  </svg>
)
export const IconArchive = p => (
  <svg viewBox="0 0 24 24" width={p.size || 15} height={p.size || 15} {...base} className={p.className}>
    <rect x="3.5" y="4" width="17" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" /><path d="M10 12h4" />
  </svg>
)
