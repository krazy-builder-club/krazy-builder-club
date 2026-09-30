/**
 * Structured one-line JSON logs for Cloud Logging. Callers pass IDs, revisions, durations and
 * scrubbed codes only — never request bodies, customer content, keys or signed URLs.
 */
type Fields = Record<string, string | number | boolean | null | undefined>;

function write(severity: 'INFO' | 'WARNING' | 'ERROR', message: string, fields: Fields) {
  if (process.env.NODE_ENV === 'test' && severity === 'INFO') return;
  const line = JSON.stringify({ severity, message, time: new Date().toISOString(), ...fields });
  if (severity === 'ERROR') console.error(line);
  else console.log(line);
}

export const log = {
  info: (message: string, fields: Fields = {}) => write('INFO', message, fields),
  warn: (message: string, fields: Fields = {}) => write('WARNING', message, fields),
  error: (message: string, fields: Fields = {}) => write('ERROR', message, fields),
};
