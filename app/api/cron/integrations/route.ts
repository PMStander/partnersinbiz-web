// /api/cron/integrations — daily-pull dispatcher.
//
// Called hourly. Each connection is pulled once per day (the dispatcher
// filters out connections already pulled today), so an hourly schedule
// gives us up-to-23-hour-late tolerance to upstream API failures.
//
// Auth: Bearer ${CRON_SECRET}.

import { NextRequest, NextResponse } from 'next/server'
import { dispatchAll } from '@/lib/integrations/dispatch'
import '@/lib/integrations/bootstrap' // populate registry

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date().toISOString().slice(0, 10)
  const summary = await dispatchAll({ today, concurrency: 4 })

  return NextResponse.json({
    today,
    ...summary,
    ok: true,
  })
}
