import { google } from 'googleapis'

const TIMEZONE = 'Africa/Johannesburg'
const DURATION_MINS = 20

function getCalendarClient() {
  const auth = new google.auth.JWT({
    email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim(),
    key: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n').trim(),
    scopes: ['https://www.googleapis.com/auth/calendar'],
  })
  return google.calendar({ version: 'v3', auth })
}

export async function getFreeBusy(date: string): Promise<{ start: string; end: string }[]> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID
  if (!calendarId) throw new Error('GOOGLE_CALENDAR_ID not set')

  const cal = getCalendarClient()
  const res = await cal.freebusy.query({
    requestBody: {
      timeMin: `${date}T00:00:00+02:00`,
      timeMax: `${date}T23:59:59+02:00`,
      timeZone: TIMEZONE,
      items: [{ id: calendarId }],
    },
  })
  return res.data.calendars?.[calendarId]?.busy ?? []
}

export async function createCalendarEvent(booking: {
  name: string
  email: string
  date: string
  time: string
}): Promise<string> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID
  if (!calendarId) throw new Error('GOOGLE_CALENDAR_ID not set')

  const cal = getCalendarClient()
  const [hour, minute] = booking.time.split(':').map(Number)
  const pad = (n: number) => String(n).padStart(2, '0')

  const startDt = `${booking.date}T${pad(hour)}:${pad(minute)}:00`
  const endTotalMins = hour * 60 + minute + DURATION_MINS
  const endDt = `${booking.date}T${pad(Math.floor(endTotalMins / 60))}:${pad(endTotalMins % 60)}:00`

  const event = await cal.events.insert({
    calendarId,
    sendUpdates: 'all',
    requestBody: {
      summary: `Intro Call — ${booking.name}`,
      description: `20-min intro call booked via partnersinbiz.online\n\nClient: ${booking.name}\nEmail: ${booking.email}`,
      start: { dateTime: startDt, timeZone: TIMEZONE },
      end: { dateTime: endDt, timeZone: TIMEZONE },
      attendees: [{ email: booking.email, displayName: booking.name }],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 15 },
        ],
      },
    },
  })

  return event.data.id ?? ''
}
