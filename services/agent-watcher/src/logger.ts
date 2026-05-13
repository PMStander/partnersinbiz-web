/**
 * Structured JSON stdout logger. One line per event so journald/Loki can index cleanly.
 */
export type LogLevel = 'info' | 'warn' | 'error'

export function log(level: LogLevel, msg: string, extra?: Record<string, unknown>): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(extra ?? {}),
  }
  // Errors go to stderr so journald separates them; info/warn to stdout.
  const line = JSON.stringify(entry)
  if (level === 'error') {
    process.stderr.write(line + '\n')
  } else {
    process.stdout.write(line + '\n')
  }
}

export const logger = {
  info: (msg: string, extra?: Record<string, unknown>) => log('info', msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => log('warn', msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => log('error', msg, extra),
}
