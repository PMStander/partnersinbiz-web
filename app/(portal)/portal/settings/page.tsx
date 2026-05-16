// app/(portal)/portal/settings/page.tsx
import { redirect } from 'next/navigation'

export default function SettingsRedirect() {
  redirect('/portal/settings/account')
}
