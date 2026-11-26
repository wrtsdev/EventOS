// One JSON object per line, so the host's log viewer can read level and time.
const write = (level, message, extra) => {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...(extra ?? {}) });
  (level === 'ERROR' ? console.error : console.log)(line);
};
export const log = {
  info: (m, x) => write('INFO', m, x),
  warn: (m, x) => write('WARN', m, x),
  error: (m, x) => write('ERROR', m, x),
};
