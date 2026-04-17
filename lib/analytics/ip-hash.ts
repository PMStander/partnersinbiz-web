import { createHash } from 'node:crypto'

const SALT = process.env.ANALYTICS_IP_SALT ?? 'pib-analytics-default-salt'

export function hashIp(ip: string): string {
  return createHash('sha256').update(`${SALT}:${ip}`).digest('hex')
}
