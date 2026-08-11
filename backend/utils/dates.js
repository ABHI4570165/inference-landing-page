const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// The drive runs in India; "today" must mean the Indian calendar day even
// when the server clock is UTC (Render/Railway). Returns the real UTC instant
// at which the current IST day started, suitable for a `$gte` on a Date field.
function startOfTodayIST() {
  const shifted = new Date(Date.now() + IST_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - IST_OFFSET_MS);
}

// 'YYYY-MM-DD' for the current IST calendar day — matches the string format
// the Attendance/Reception collections store in their `date` field.
function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

module.exports = { startOfTodayIST, todayIST, IST_OFFSET_MS };
