# PartnersInBiz React App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert five Stitch-generated HTML pages into a production Next.js 14 app with Firebase Auth, Firestore, role-based portals, and a lead capture form.

**Architecture:** Next.js 14 App Router with React Server Components for public pages (SEO). Firebase session cookies enable server-side route protection via `middleware.ts`. All Firestore writes from the app go through Next.js API routes using the Firebase Admin SDK.

**Tech Stack:** Next.js 14 · TypeScript · Tailwind CSS · Firebase Auth + Firestore + Admin SDK · Resend · Jest

---

## File Map

| File | Responsibility |
|---|---|
| `tailwind.config.ts` | Exact design tokens from stitch files |
| `app/layout.tsx` | Root layout: fonts, global styles, navbar, footer |
| `components/layout/Navbar.tsx` | Top navigation bar |
| `components/layout/Footer.tsx` | Site footer |
| `app/(public)/page.tsx` | Landing page |
| `app/(public)/about/page.tsx` | About Us page |
| `app/(public)/our-process/page.tsx` | Our Process page |
| `app/(public)/discover/page.tsx` | Discover Phase page |
| `app/(public)/start-a-project/page.tsx` | Lead capture form page |
| `lib/firebase/config.ts` | Firebase client SDK init |
| `lib/firebase/admin.ts` | Firebase Admin SDK init (server-only) |
| `lib/firebase/auth.ts` | Client-side auth helpers |
| `lib/firebase/firestore.ts` | Firestore query helpers |
| `app/api/auth/session/route.ts` | POST/DELETE session cookie endpoint |
| `app/api/auth/verify/route.ts` | POST session verification (used by middleware) |
| `app/api/enquiries/route.ts` | POST lead capture endpoint |
| `app/api/enquiries/[id]/route.ts` | PATCH enquiry status (admin-only, uses Admin SDK) |
| `middleware.ts` | Route protection via session cookie |
| `app/(auth)/login/page.tsx` | Login page |
| `app/(auth)/register/page.tsx` | Register page |
| `app/(portal)/dashboard/page.tsx` | Client portal |
| `app/(admin)/dashboard/page.tsx` | Admin dashboard |
| `app/sitemap.ts` | XML sitemap |
| `app/robots.ts` | robots.txt |
| `firestore.rules` | Firestore security rules |
| `__tests__/api/enquiries.test.ts` | API route unit tests |

---

## Task 1: Project Bootstrap

**Files:**
- Create: `package.json` (via CLI)
- Create: `tailwind.config.ts`
- Create: `.env.local`
- Create: `app/globals.css`

- [ ] **Step 1: Scaffold Next.js app**

Run in `/Users/peetstander/Projects/own/partnersinbiz`:
```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --yes
```
Expected: Next.js project created in current directory.

- [ ] **Step 2: Install dependencies**

```bash
npm install firebase firebase-admin resend
npm install -D jest jest-environment-node @types/jest ts-jest
```

- [ ] **Step 3: Replace tailwind.config.ts with the stitch design system**

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'surface-container': '#1f1f1f',
        'surface-container-highest': '#353535',
        'on-secondary-container': '#e2e2e2',
        'primary-fixed': '#5d5f5f',
        'on-tertiary-container': '#000000',
        'surface-bright': '#393939',
        'primary-container': '#d4d4d4',
        'surface-container-low': '#1b1b1b',
        'on-error-container': '#ffdad6',
        'tertiary-fixed-dim': '#454747',
        'secondary-container': '#454747',
        'error': '#ffb4ab',
        'surface-variant': '#353535',
        'inverse-surface': '#e2e2e2',
        'outline-variant': '#474747',
        'on-secondary': '#1a1c1c',
        'background': '#000000',
        'on-surface': '#e2e2e2',
        'on-primary-container': '#000000',
        'on-tertiary-fixed-variant': '#e2e2e2',
        'on-tertiary-fixed': '#ffffff',
        'on-tertiary': '#1a1c1c',
        'primary': '#ffffff',
        'surface': '#000000',
        'secondary': '#c6c6c7',
        'on-secondary-fixed': '#1a1c1c',
        'primary-fixed-dim': '#454747',
        'on-primary': '#1a1c1c',
        'surface-tint': '#c6c6c7',
        'secondary-fixed': '#c6c6c7',
        'on-primary-fixed-variant': '#e2e2e2',
        'tertiary': '#e2e2e2',
        'surface-dim': '#000000',
        'inverse-primary': '#5d5f5f',
        'error-container': '#93000a',
        'outline': '#919191',
        'on-secondary-fixed-variant': '#3a3c3c',
        'on-background': '#e2e2e2',
        'surface-container-high': '#2a2a2a',
        'on-surface-variant': '#c6c6c6',
        'inverse-on-surface': '#303030',
        'tertiary-container': '#909191',
        'secondary-fixed-dim': '#aaabab',
        'surface-container-lowest': '#000000',
        'on-error': '#690005',
        'on-primary-fixed': '#ffffff',
        'tertiary-fixed': '#5d5f5f',
      },
      fontFamily: {
        headline: ['var(--font-space-grotesk)', 'sans-serif'],
        body: ['var(--font-inter)', 'sans-serif'],
        label: ['var(--font-inter)', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1.5rem',
        full: '9999px',
      },
    },
  },
  plugins: [],
}
export default config
```

- [ ] **Step 4: Update app/globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html { @apply dark; }
  body { @apply bg-black text-white font-body selection:bg-white selection:text-black; }
}

@layer components {
  .glass-card {
    background: rgba(255, 255, 255, 0.03);
    backdrop-filter: blur(40px) saturate(1.8);
    -webkit-backdrop-filter: blur(40px) saturate(1.8);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 1.5rem;
  }
  .material-symbols-outlined {
    font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24;
  }
}

@layer utilities {
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: #000; }
  ::-webkit-scrollbar-thumb { background: #333; }
}
```

- [ ] **Step 5: Create .env.local**

```
NEXT_PUBLIC_FIREBASE_API_KEY=placeholder
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=placeholder
NEXT_PUBLIC_FIREBASE_PROJECT_ID=placeholder
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=placeholder
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=placeholder
NEXT_PUBLIC_FIREBASE_APP_ID=placeholder

FIREBASE_ADMIN_PROJECT_ID=placeholder
FIREBASE_ADMIN_CLIENT_EMAIL=placeholder
FIREBASE_ADMIN_PRIVATE_KEY=placeholder

RESEND_API_KEY=placeholder
RESEND_FROM_ADDRESS=noreply@partnersinbiz.com
ADMIN_NOTIFICATION_EMAIL=admin@partnersinbiz.com

SESSION_COOKIE_NAME=__session
SESSION_EXPIRY_DAYS=14
```

- [ ] **Step 6: Configure Jest**

Create `jest.config.ts`:
```typescript
import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
}
export default config
```

- [ ] **Step 7: Verify dev server starts**

```bash
npm run dev
```
Expected: Server runs at http://localhost:3000 with default Next.js page.

- [ ] **Step 8: Commit**

> **Note:** `create-next-app` adds `.env.local` to `.gitignore` by default — do not commit it. Commit only the config files.

```bash
git init
git add tailwind.config.ts app/globals.css jest.config.ts
git commit -m "feat: bootstrap Next.js project with design system config"
```

---

## Task 2: Shared Layout — Navbar + Footer + Root Layout

**Files:**
- Create: `components/layout/Navbar.tsx`
- Create: `components/layout/Footer.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Add Material Symbols font link and Space Grotesk + Inter via next/font**

Edit `app/layout.tsx`:
```tsx
import type { Metadata } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import './globals.css'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'PiB | Digital Excellence Engineered',
  description: 'Partners in Biz. Engineering digital dominance for the next generation of industry leaders.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        />
      </head>
      <body className={`${inter.variable} ${spaceGrotesk.variable} bg-black text-white font-body selection:bg-white selection:text-black`}>
        <Navbar />
        {children}
        <Footer />
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Create Navbar component**

Create `components/layout/Navbar.tsx`:
```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/', label: 'Home' },
  { href: '/our-process', label: 'Services' },
  { href: '/discover', label: 'Work' },
  { href: '/about', label: 'About' },
  { href: '/start-a-project', label: 'Contact' },
]

export default function Navbar() {
  const pathname = usePathname()
  return (
    <nav className="fixed top-0 w-full border-b border-white/[0.15] bg-black/20 backdrop-blur-2xl flex justify-between items-center px-8 md:px-16 h-20 z-50 font-headline font-medium tracking-tight">
      <Link href="/" className="text-2xl font-bold tracking-tighter text-white">PiB</Link>
      <div className="hidden md:flex items-center gap-12">
        {links.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`transition-colors duration-300 ${
              pathname === href
                ? 'text-white border-b border-white pb-1'
                : 'text-white/60 hover:text-white'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>
      <Link
        href="/start-a-project"
        className="rounded-full bg-white/[0.08] hover:bg-white/[0.15] px-6 py-2 text-sm font-medium transition-all active:scale-95 text-white"
      >
        Start a Project
      </Link>
    </nav>
  )
}
```

- [ ] **Step 3: Create Footer component**

Create `components/layout/Footer.tsx`:
```tsx
import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="relative z-10 bg-black w-full py-20 border-t border-white/[0.1] font-body text-sm tracking-wide">
      <div className="max-w-7xl mx-auto px-8 md:px-16 grid grid-cols-1 md:grid-cols-4 gap-12">
        <div className="col-span-1 md:col-span-2">
          <div className="text-2xl font-bold tracking-tighter text-white font-headline mb-6">PiB</div>
          <p className="text-white/40 max-w-xs mb-8">
            Partners in Biz. Engineering digital dominance for the next generation of industry leaders.
          </p>
          <div className="flex gap-6">
            <a href="#" className="text-white/40 hover:text-white transition-opacity">Twitter</a>
            <a href="#" className="text-white/40 hover:text-white transition-opacity">LinkedIn</a>
            <a href="#" className="text-white/40 hover:text-white transition-opacity">Instagram</a>
          </div>
        </div>
        <div>
          <h5 className="text-white font-bold mb-6">Company</h5>
          <ul className="space-y-4">
            <li><Link href="/our-process" className="text-white/40 hover:text-white transition-opacity">Services</Link></li>
            <li><Link href="/discover" className="text-white/40 hover:text-white transition-opacity">Work</Link></li>
            <li><Link href="/about" className="text-white/40 hover:text-white transition-opacity">About</Link></li>
            <li><a href="#" className="text-white/40 hover:text-white transition-opacity">Careers</a></li>
          </ul>
        </div>
        <div>
          <h5 className="text-white font-bold mb-6">Support</h5>
          <ul className="space-y-4">
            <li><Link href="/start-a-project" className="text-white/40 hover:text-white transition-opacity">Contact</Link></li>
            <li><a href="#" className="text-white/40 hover:text-white transition-opacity">Privacy Policy</a></li>
            <li><a href="#" className="text-white/40 hover:text-white transition-opacity">Terms of Service</a></li>
          </ul>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-8 md:px-16 mt-20 pt-8 border-t border-white/[0.05]">
        <p className="text-white/20 text-xs">© 2026 Partners in Biz. Digital Excellence Engineered.</p>
      </div>
    </footer>
  )
}
```

- [ ] **Step 4: Delete the default Next.js home page content and verify layout renders**

Run: `npm run dev` and open http://localhost:3000
Expected: Navbar and Footer visible, no errors in console.

- [ ] **Step 5: Commit**

```bash
git add app/layout.tsx components/layout/Navbar.tsx components/layout/Footer.tsx
git commit -m "feat: add shared Navbar and Footer layout components"
```

---

## Task 3: Landing Page

**Files:**
- Create: `app/(public)/page.tsx`

Reference: `stitch/pib_landing_page/code.html` and `stitch/pib_landing_page/screen.png`

- [ ] **Step 1: Create the route group folder and page**

```bash
mkdir -p app/\(public\)
```

- [ ] **Step 2: Implement the landing page as a React Server Component**

Convert `stitch/pib_landing_page/code.html` (lines 119–256, the `<main>` content) to `app/(public)/page.tsx`. The Navbar and Footer are already in the layout — only include `<main>` content.

Key conversion rules:
- `class=` → `className=`
- Inline `style` attributes stay as-is
- `<a href="#">` → `<Link href="...">` for internal links, `<a>` for external/placeholder
- Remove the `<head>`, `<nav>`, `<footer>` blocks (handled by layout)
- Background video: wrap in a `<div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">` before `<main>`

```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'PiB | Digital Excellence Engineered',
  description: 'We engineer high-performance digital instruments for brands that demand absolute precision and technical superiority.',
}

export default function HomePage() {
  return (
    <>
      {/* Background Video Layer */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute min-w-full min-h-full object-cover brightness-[0.15]"
        >
          <source
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260302_141646_a5156969-0608-4d43-9e34-90f4716d1f32.mp4"
            type="video/mp4"
          />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black" />
      </div>
      {/* Page content — copy <main> block from stitch/pib_landing_page/code.html */}
      <main className="relative z-10 px-8 md:px-16">
        {/* ... converted JSX from stitch HTML ... */}
      </main>
    </>
  )
}
```

> **Important:** Do a side-by-side comparison with `stitch/pib_landing_page/screen.png` in the browser after conversion to verify pixel accuracy.

- [ ] **Step 3: Verify visually**

Run: `npm run dev`
Open http://localhost:3000 and compare against `stitch/pib_landing_page/screen.png`.
Expected: Layout, typography, glass cards, and spacing match exactly.

- [ ] **Step 4: Commit**

```bash
git add app/\(public\)/page.tsx
git commit -m "feat: add landing page converted from stitch design"
```

---

## Task 4: About Us Page

**Files:**
- Create: `app/(public)/about/page.tsx`

Reference: `stitch/pib_about_us/code.html` and `stitch/pib_about_us/screen.png`

- [ ] **Step 1: Create the page**

Same conversion rules as Task 3. Extract only the `<main>` content. Add `generateMetadata` or an exported `metadata` object.

```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About Us | PiB',
  description: 'Learn about Partners in Biz — our mission, team, and values.',
}

export default function AboutPage() {
  return (
    <main className="relative z-10 pt-32 pb-24 px-8 md:px-16">
      {/* converted JSX from stitch/pib_about_us/code.html <main> block */}
    </main>
  )
}
```

- [ ] **Step 2: Verify visually**

Open http://localhost:3000/about and compare against `stitch/pib_about_us/screen.png`.

- [ ] **Step 3: Commit**

```bash
git add app/\(public\)/about/page.tsx
git commit -m "feat: add About Us page converted from stitch design"
```

---

## Task 5: Our Process Page

**Files:**
- Create: `app/(public)/our-process/page.tsx`

Reference: `stitch/pib_our_process/code.html` and `stitch/pib_our_process/screen.png`

- [ ] **Step 1: Create the page** (same pattern as Tasks 3–4)

```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Our Process | PiB',
  description: 'How we engineer digital solutions — our proven process from discovery to delivery.',
}

export default function OurProcessPage() {
  return (
    <main className="relative z-10 pt-32 pb-24 px-8 md:px-16">
      {/* converted JSX from stitch/pib_our_process/code.html */}
    </main>
  )
}
```

- [ ] **Step 2: Verify visually against screen.png**

- [ ] **Step 3: Commit**

```bash
git add app/\(public\)/our-process/page.tsx
git commit -m "feat: add Our Process page converted from stitch design"
```

---

## Task 6: Discover Phase Page

**Files:**
- Create: `app/(public)/discover/page.tsx`

Reference: `stitch/pib_discover_phase/code.html` and `stitch/pib_discover_phase/screen.png`

- [ ] **Step 1: Create the page** (same pattern)

```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Discover Phase | PiB',
  description: 'The Discover Phase — where we deeply understand your business before writing a single line of code.',
}

export default function DiscoverPage() {
  return (
    <main className="relative z-10 pt-32 pb-24 px-8 md:px-16">
      {/* converted JSX from stitch/pib_discover_phase/code.html */}
    </main>
  )
}
```

- [ ] **Step 2: Verify visually against screen.png**

- [ ] **Step 3: Commit**

```bash
git add app/\(public\)/discover/page.tsx
git commit -m "feat: add Discover Phase page converted from stitch design"
```

---

## Task 7: Start a Project Page (static form)

**Files:**
- Create: `app/(public)/start-a-project/page.tsx`

Reference: `stitch/pib_start_a_project/code.html` and `stitch/pib_start_a_project/screen.png`

This task converts the static form UI only. Form submission logic is wired up in Task 12.

- [ ] **Step 1: Create the page with background video + static form**

```tsx
import type { Metadata } from 'next'
import StartProjectForm from './StartProjectForm'

export const metadata: Metadata = {
  title: 'Start a Project | PiB',
  description: 'Tell us about your ambition. We\'ll build the machine to reach it.',
}

export default function StartProjectPage() {
  return (
    <>
      {/* Background Video */}
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <video autoPlay loop muted playsInline className="absolute min-w-full min-h-full object-cover brightness-[0.25]">
          <source
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260302_141646_a5156969-0608-4d43-9e34-90f4716d1f32.mp4"
            type="video/mp4"
          />
        </video>
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black" />
      </div>
      <main className="relative z-10 pt-32 pb-24 px-8 md:px-16 min-h-screen flex flex-col items-center">
        {/* Hero */}
        <header className="w-full max-w-5xl mb-20 text-center">
          <div className="inline-block px-3 py-1 mb-6 border border-white/20 rounded-full">
            <span className="font-label text-[0.6rem] uppercase tracking-[0.3em] text-white/50">Project Inquiry Portal v2.0</span>
          </div>
          <h1 className="font-headline text-5xl md:text-8xl font-bold tracking-tighter mb-8 leading-none">
            Start a Project
          </h1>
          <p className="font-body text-xl md:text-2xl text-white/60 max-w-2xl mx-auto font-light leading-relaxed">
            Tell us about your ambition. We'll build the machine to reach it.
          </p>
        </header>
        <StartProjectForm />
      </main>
    </>
  )
}
```

- [ ] **Step 2: Create the form as a Client Component placeholder**

Create `app/(public)/start-a-project/StartProjectForm.tsx`:
```tsx
'use client'

export default function StartProjectForm() {
  return (
    <section className="w-full max-w-4xl">
      <div className="glass-card p-8 md:p-16 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 blur-[80px] -mr-16 -mt-16 rounded-full" />
        <form className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">
          {/* Full Name */}
          <div className="flex flex-col gap-2">
            <label className="font-headline text-[0.7rem] uppercase tracking-widest text-white/40">Full Name</label>
            <input name="name" type="text" placeholder="ALEXANDER VANCE"
              className="bg-transparent border-0 border-b border-white/20 py-3 text-white font-body placeholder:text-white/10 focus:border-white focus:outline-none transition-colors" />
          </div>
          {/* Email */}
          <div className="flex flex-col gap-2">
            <label className="font-headline text-[0.7rem] uppercase tracking-widest text-white/40">Email Address</label>
            <input name="email" type="email" placeholder="CONTACT@DOMAIN.COM"
              className="bg-transparent border-0 border-b border-white/20 py-3 text-white font-body placeholder:text-white/10 focus:border-white focus:outline-none transition-colors" />
          </div>
          {/* Company */}
          <div className="flex flex-col gap-2">
            <label className="font-headline text-[0.7rem] uppercase tracking-widest text-white/40">Company Name</label>
            <input name="company" type="text" placeholder="SYSTEMS INC."
              className="bg-transparent border-0 border-b border-white/20 py-3 text-white font-body placeholder:text-white/10 focus:border-white focus:outline-none transition-colors" />
          </div>
          {/* Project Type */}
          <div className="flex flex-col gap-2">
            <label className="font-headline text-[0.7rem] uppercase tracking-widest text-white/40">Project Type</label>
            <div className="relative">
              <select name="projectType"
                className="w-full bg-transparent border-0 border-b border-white/20 py-3 text-white font-body focus:border-white focus:outline-none transition-colors appearance-none cursor-pointer">
                <option className="bg-neutral-900" value="web">Web Development</option>
                <option className="bg-neutral-900" value="mobile">Mobile App</option>
                <option className="bg-neutral-900" value="ai">AI Solution</option>
                <option className="bg-neutral-900" value="design">Product Design</option>
              </select>
              <span className="material-symbols-outlined absolute right-0 top-3 text-white/30 pointer-events-none">expand_more</span>
            </div>
          </div>
          {/* Project Details */}
          <div className="md:col-span-2 flex flex-col gap-2 mt-4">
            <label className="font-headline text-[0.7rem] uppercase tracking-widest text-white/40">Project Details</label>
            <textarea name="details" rows={4} placeholder="DESCRIBE THE SCOPE, TIMELINE, AND OBJECTIVES..."
              className="bg-transparent border-0 border-b border-white/20 py-3 text-white font-body placeholder:text-white/10 focus:border-white focus:outline-none transition-colors resize-none" />
          </div>
          {/* CTA */}
          <div className="md:col-span-2 pt-8 flex flex-col md:flex-row justify-between items-center gap-8">
            <p className="font-body text-[0.75rem] text-white/30 max-w-sm">
              By submitting this inquiry, you agree to our processing of your data for communication regarding this request.
            </p>
            <button type="submit"
              className="group relative w-full md:w-auto bg-white text-black px-12 py-5 rounded-md font-headline font-bold uppercase tracking-widest text-sm hover:bg-white/90 transition-all active:scale-[0.98]">
              Send Inquiry
              <span className="material-symbols-outlined align-middle ml-2 text-xl group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Verify visually against screen.png**

Open http://localhost:3000/start-a-project

- [ ] **Step 4: Commit**

```bash
git add "app/(public)/start-a-project/"
git commit -m "feat: add Start a Project page with static form"
```

---

## Task 8: Firebase Setup

**Files:**
- Create: `lib/firebase/config.ts`
- Create: `lib/firebase/admin.ts`

- [ ] **Step 1: Create client Firebase config**

Create `lib/firebase/config.ts`:
```typescript
import { initializeApp, getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]

export const auth = getAuth(app)
export const db = getFirestore(app)
```

- [ ] **Step 2: Create Admin SDK config (server-only)**

Create `lib/firebase/admin.ts`:
```typescript
import { initializeApp, getApps, cert, App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0]
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  })
}

const adminApp = getAdminApp()
export const adminAuth = getAuth(adminApp)
export const adminDb = getFirestore(adminApp)
```

- [ ] **Step 3: Commit**

```bash
git add lib/firebase/config.ts lib/firebase/admin.ts
git commit -m "feat: add Firebase client and Admin SDK setup"
```

---

## Task 9: Session Cookie API Route

**Files:**
- Create: `app/api/auth/session/route.ts`

- [ ] **Step 1: Write the failing test**

Create `__tests__/api/session.test.ts`:
```typescript
// Minimal smoke test — verifies route file exports POST and DELETE handlers
import { POST, DELETE } from '@/app/api/auth/session/route'

describe('session route', () => {
  it('exports POST handler', () => {
    expect(typeof POST).toBe('function')
  })
  it('exports DELETE handler', () => {
    expect(typeof DELETE).toBe('function')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest __tests__/api/session.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the session route**

Create `app/api/auth/session/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { adminAuth } from '@/lib/firebase/admin'

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? '__session'
const EXPIRY_DAYS = parseInt(process.env.SESSION_EXPIRY_DAYS ?? '14')
const EXPIRY_MS = EXPIRY_DAYS * 24 * 60 * 60 * 1000

export async function POST(request: NextRequest) {
  const { idToken } = await request.json()
  if (!idToken) {
    return NextResponse.json({ error: 'idToken required' }, { status: 400 })
  }
  try {
    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn: EXPIRY_MS })
    const response = NextResponse.json({ status: 'ok' })
    response.cookies.set(COOKIE_NAME, sessionCookie, {
      maxAge: EXPIRY_MS / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      sameSite: 'lax',
    })
    return response
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }
}

export async function DELETE() {
  const response = NextResponse.json({ status: 'ok' })
  response.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' })
  return response
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx jest __tests__/api/session.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/session/route.ts __tests__/api/session.test.ts
git commit -m "feat: add session cookie API route (POST/DELETE)"
```

---

## Task 10: Auth Middleware

**Files:**
- Create: `middleware.ts`

- [ ] **Step 1: Implement middleware**

Create `middleware.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? '__session'

// These paths require authentication
const PROTECTED = ['/portal', '/admin']
// Admin-only paths
const ADMIN_ONLY = ['/admin']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isProtected = PROTECTED.some((p) => pathname.startsWith(p))
  if (!isProtected) return NextResponse.next()

  const sessionCookie = request.cookies.get(COOKIE_NAME)?.value
  if (!sessionCookie) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Verify session cookie via internal API to avoid importing Admin SDK in edge runtime
  const verifyResponse = await fetch(new URL('/api/auth/verify', request.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionCookie }),
  })

  if (!verifyResponse.ok) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const { role } = await verifyResponse.json()
  const isAdminOnly = ADMIN_ONLY.some((p) => pathname.startsWith(p))
  if (isAdminOnly && role !== 'admin') {
    return NextResponse.redirect(new URL('/portal/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/portal/:path*', '/admin/:path*'],
}
```

- [ ] **Step 2: Create the verify API route used by middleware**

Create `app/api/auth/verify/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase/admin'

export async function POST(request: NextRequest) {
  const { sessionCookie } = await request.json()
  if (!sessionCookie) {
    return NextResponse.json({ error: 'No cookie' }, { status: 401 })
  }
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true)
    const userDoc = await adminDb.collection('users').doc(decoded.uid).get()
    const role = userDoc.exists ? userDoc.data()?.role : 'client'
    return NextResponse.json({ uid: decoded.uid, role })
  } catch {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }
}
```

- [ ] **Step 3: Verify routes are protected**

Start dev server and try visiting http://localhost:3000/portal/dashboard without being logged in.
Expected: Redirect to /login.

- [ ] **Step 4: Commit**

```bash
git add middleware.ts app/api/auth/verify/route.ts
git commit -m "feat: add route protection middleware with role-based access"
```

---

## Task 11: Auth Helpers + Login + Register Pages

**Files:**
- Create: `lib/firebase/auth.ts`
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(auth)/register/page.tsx`

- [ ] **Step 1: Create auth helpers**

Create `lib/firebase/auth.ts`:
```typescript
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { auth, db } from './config'

export async function loginWithEmail(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password)
  const idToken = await credential.user.getIdToken()
  await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  })
  return credential.user
}

export async function registerWithEmail(email: string, password: string, name: string) {
  const credential = await createUserWithEmailAndPassword(auth, email, password)
  await setDoc(doc(db, 'users', credential.user.uid), {
    name,
    email,
    role: 'client',
    createdAt: new Date(),
  })
  const idToken = await credential.user.getIdToken()
  await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  })
  return credential.user
}

export async function logout() {
  await signOut(auth)
  await fetch('/api/auth/session', { method: 'DELETE' })
}
```

- [ ] **Step 2: Create Login page**

Create `app/(auth)/login/page.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { loginWithEmail } from '@/lib/firebase/auth'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const form = new FormData(e.currentTarget)
    try {
      await loginWithEmail(form.get('email') as string, form.get('password') as string)
      router.push('/portal/dashboard')
    } catch {
      setError('Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="relative z-10 min-h-screen flex items-center justify-center px-8 pt-20">
      <div className="glass-card p-10 w-full max-w-md">
        <h1 className="font-headline text-3xl font-bold tracking-tighter mb-8">Sign In</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label className="font-headline text-[0.7rem] uppercase tracking-widest text-white/40">Email</label>
            <input name="email" type="email" required
              className="bg-transparent border-0 border-b border-white/20 py-3 text-white font-body focus:border-white focus:outline-none transition-colors" />
          </div>
          <div className="flex flex-col gap-2">
            <label className="font-headline text-[0.7rem] uppercase tracking-widest text-white/40">Password</label>
            <input name="password" type="password" required
              className="bg-transparent border-0 border-b border-white/20 py-3 text-white font-body focus:border-white focus:outline-none transition-colors" />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" disabled={loading}
            className="bg-white text-black px-8 py-4 rounded-md font-headline font-bold uppercase tracking-widest text-sm hover:bg-white/90 transition-all disabled:opacity-50 mt-2">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <p className="text-white/40 text-sm mt-6 text-center">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-white hover:underline">Register</Link>
        </p>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Create Register page**

Create `app/(auth)/register/page.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { registerWithEmail } from '@/lib/firebase/auth'

export default function RegisterPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const form = new FormData(e.currentTarget)
    const password = form.get('password') as string
    const confirm = form.get('confirm') as string
    if (password !== confirm) {
      setError('Passwords do not match.')
      setLoading(false)
      return
    }
    try {
      await registerWithEmail(form.get('email') as string, password, form.get('name') as string)
      router.push('/portal/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="relative z-10 min-h-screen flex items-center justify-center px-8 pt-20">
      <div className="glass-card p-10 w-full max-w-md">
        <h1 className="font-headline text-3xl font-bold tracking-tighter mb-8">Create Account</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {[
            { name: 'name', label: 'Full Name', type: 'text' },
            { name: 'email', label: 'Email', type: 'email' },
            { name: 'password', label: 'Password', type: 'password' },
            { name: 'confirm', label: 'Confirm Password', type: 'password' },
          ].map(({ name, label, type }) => (
            <div key={name} className="flex flex-col gap-2">
              <label className="font-headline text-[0.7rem] uppercase tracking-widest text-white/40">{label}</label>
              <input name={name} type={type} required
                className="bg-transparent border-0 border-b border-white/20 py-3 text-white font-body focus:border-white focus:outline-none transition-colors" />
            </div>
          ))}
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button type="submit" disabled={loading}
            className="bg-white text-black px-8 py-4 rounded-md font-headline font-bold uppercase tracking-widest text-sm hover:bg-white/90 transition-all disabled:opacity-50 mt-2">
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>
        <p className="text-white/40 text-sm mt-6 text-center">
          Already have an account?{' '}
          <Link href="/login" className="text-white hover:underline">Sign in</Link>
        </p>
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Manually test login flow**

1. Register a new account at http://localhost:3000/register
2. Verify redirect to /portal/dashboard
3. Try accessing /portal/dashboard without being logged in — expect redirect to /login

- [ ] **Step 5: Commit**

```bash
git add lib/firebase/auth.ts "app/(auth)/"
git commit -m "feat: add auth helpers and login/register pages"
```

---

## Task 12: Lead Capture Form — API Route + Wire Up Form

**Files:**
- Create: `app/api/enquiries/route.ts`
- Modify: `app/(public)/start-a-project/StartProjectForm.tsx`
- Create: `__tests__/api/enquiries.test.ts`

- [ ] **Step 1: Write failing tests for the API route**

Create `__tests__/api/enquiries.test.ts`:
```typescript
import { POST } from '@/app/api/enquiries/route'
import { NextRequest } from 'next/server'

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/enquiries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// Mock firebase admin and resend
jest.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({
      add: jest.fn().mockResolvedValue({ id: 'test-id' }),
    }),
  },
}))
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: jest.fn().mockResolvedValue({ id: 'email-id' }) },
  })),
}))

describe('POST /api/enquiries', () => {
  it('returns 400 when name is missing', async () => {
    const req = makeRequest({ email: 'test@test.com', projectType: 'web', details: 'some details' })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/name/i)
  })

  it('returns 400 when email is missing', async () => {
    const req = makeRequest({ name: 'Test', projectType: 'web', details: 'some details' })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/email/i)
  })

  it('returns 400 when email is invalid', async () => {
    const req = makeRequest({ name: 'Test', email: 'not-an-email', projectType: 'web', details: 'some details' })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/email/i)
  })

  it('returns 400 when details is missing', async () => {
    const req = makeRequest({ name: 'Test', email: 'test@test.com', projectType: 'web' })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/details/i)
  })

  it('returns 201 on valid submission', async () => {
    const req = makeRequest({ name: 'Test User', email: 'test@test.com', projectType: 'web', details: 'Build me a site' })
    const res = await POST(req)
    expect(res.status).toBe(201)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/api/enquiries.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the enquiries API route**

Create `app/api/enquiries/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { Resend } from 'resend'
import { FieldValue } from 'firebase-admin/firestore'

const resend = new Resend(process.env.RESEND_API_KEY)

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { name, email, company, projectType, details, userId } = body

  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (!email?.trim()) return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  if (!isValidEmail(email)) return NextResponse.json({ error: 'Email is invalid' }, { status: 400 })
  if (!details?.trim()) return NextResponse.json({ error: 'Project details are required' }, { status: 400 })

  const docRef = await adminDb.collection('enquiries').add({
    userId: userId ?? null,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    company: company?.trim() ?? '',
    projectType: projectType ?? 'web',
    details: details.trim(),
    status: 'new',
    createdAt: FieldValue.serverTimestamp(),
    assignedTo: null,
  })

  await resend.emails.send({
    from: process.env.RESEND_FROM_ADDRESS!,
    to: process.env.ADMIN_NOTIFICATION_EMAIL!,
    subject: `New Project Inquiry from ${name}`,
    html: `
      <h2>New Project Inquiry</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Company:</strong> ${company ?? 'Not provided'}</p>
      <p><strong>Project Type:</strong> ${projectType}</p>
      <p><strong>Details:</strong></p>
      <p>${details}</p>
      <p><em>Enquiry ID: ${docRef.id}</em></p>
    `,
  })

  return NextResponse.json({ id: docRef.id }, { status: 201 })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/api/enquiries.test.ts
```
Expected: All 5 tests PASS.

- [ ] **Step 5: Wire up the form to call the API**

Update `app/(public)/start-a-project/StartProjectForm.tsx` — add `onSubmit` handler:
```tsx
'use client'
import { useState } from 'react'

type Status = 'idle' | 'loading' | 'success' | 'error'

export default function StartProjectForm() {
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('loading')
    setErrorMsg('')
    const form = new FormData(e.currentTarget)
    const payload = {
      name: form.get('name'),
      email: form.get('email'),
      company: form.get('company'),
      projectType: form.get('projectType'),
      details: form.get('details'),
    }
    try {
      const res = await fetch('/api/enquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Submission failed')
      }
      setStatus('success')
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.')
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <section className="w-full max-w-4xl">
        <div className="glass-card p-16 text-center">
          <span className="material-symbols-outlined text-5xl text-white/60 mb-6 block">check_circle</span>
          <h2 className="font-headline text-3xl font-bold tracking-tighter mb-4">Inquiry Received</h2>
          <p className="text-white/50">We&apos;ll be in touch within 24 hours.</p>
        </div>
      </section>
    )
  }

  return (
    // ... same JSX as Step 2 in Task 7, but with onSubmit={handleSubmit} on the form
    // and disabled={status === 'loading'} on the button
    // and {status === 'error' && <p className="text-red-400 text-sm md:col-span-2">{errorMsg}</p>} before CTA div
    <section className="w-full max-w-4xl">
      {/* ... */}
    </section>
  )
}
```

> **Note:** Copy the full form JSX from Task 7 Step 2 and add the `onSubmit` handler, loading state, and error display.

- [ ] **Step 6: Manually test form submission**

1. Fill out the form at http://localhost:3000/start-a-project
2. Submit — verify success state appears
3. Check Firestore emulator (or real project) for the new document

- [ ] **Step 7: Commit**

```bash
git add app/api/enquiries/route.ts "app/(public)/start-a-project/StartProjectForm.tsx" __tests__/api/enquiries.test.ts
git commit -m "feat: add enquiries API route with validation and wire up form"
```

---

## Task 13: Firestore Helpers + Client Portal

**Files:**
- Create: `lib/firebase/firestore.ts`
- Create: `app/(portal)/dashboard/page.tsx`

- [ ] **Step 1: Create Firestore helpers**

Create `lib/firebase/firestore.ts`:
```typescript
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from './config'

export type Enquiry = {
  id: string
  name: string
  email: string
  company: string
  projectType: string
  details: string
  status: 'new' | 'reviewing' | 'active' | 'closed'
  createdAt: Date
}

export async function getClientEnquiries(userId: string): Promise<Enquiry[]> {
  const q = query(collection(db, 'enquiries'), where('userId', '==', userId))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Enquiry))
}
```

- [ ] **Step 2: Create client portal page**

Create `app/(portal)/dashboard/page.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase/config'
import { getClientEnquiries, type Enquiry } from '@/lib/firebase/firestore'
import { logout } from '@/lib/firebase/auth'

const STATUS_LABELS: Record<string, string> = {
  new: 'Under Review',
  reviewing: 'In Discussion',
  active: 'In Progress',
  closed: 'Completed',
}

export default function PortalDashboard() {
  const router = useRouter()
  const [enquiries, setEnquiries] = useState<Enquiry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/login'); return }
      const data = await getClientEnquiries(user.uid)
      setEnquiries(data)
      setLoading(false)
    })
  }, [router])

  async function handleLogout() {
    await logout()
    router.push('/')
  }

  return (
    <main className="relative z-10 pt-32 pb-24 px-8 md:px-16 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-16">
          <h1 className="font-headline text-4xl font-bold tracking-tighter">Your Projects</h1>
          <button onClick={handleLogout} className="text-white/40 hover:text-white text-sm transition-colors">
            Sign out
          </button>
        </div>
        {loading ? (
          <p className="text-white/40">Loading...</p>
        ) : enquiries.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <p className="text-white/40 mb-6">No enquiries yet.</p>
            <a href="/start-a-project" className="text-white underline text-sm">Start a project</a>
          </div>
        ) : (
          <div className="space-y-4">
            {enquiries.map((enq) => (
              <div key={enq.id} className="glass-card p-8">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-headline text-xl font-bold tracking-tight mb-2">{enq.projectType.toUpperCase()}</h3>
                    <p className="text-white/50 text-sm mb-4">{enq.details.slice(0, 120)}...</p>
                  </div>
                  <span className="text-xs font-label uppercase tracking-widest text-white/40 border border-white/20 px-3 py-1 rounded-full">
                    {STATUS_LABELS[enq.status] ?? enq.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Verify portal displays enquiries**

Submit a form at /start-a-project while logged in, then visit /portal/dashboard.
Expected: The enquiry appears with status "Under Review".

- [ ] **Step 4: Commit**

```bash
git add lib/firebase/firestore.ts "app/(portal)/"
git commit -m "feat: add client portal dashboard showing enquiry status"
```

---

## Task 14: Admin Dashboard

**Files:**
- Create: `app/(admin)/dashboard/page.tsx`

- [ ] **Step 1: Create the PATCH enquiry API route (admin writes go through here)**

Create `app/api/enquiries/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { adminAuth, adminDb } from '@/lib/firebase/admin'

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? '__session'
const VALID_STATUSES = ['new', 'reviewing', 'active', 'closed']

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const sessionCookie = request.cookies.get(COOKIE_NAME)?.value
  if (!sessionCookie) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let uid: string
  try {
    const decoded = await adminAuth.verifySessionCookie(sessionCookie, true)
    uid = decoded.uid
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userDoc = await adminDb.collection('users').doc(uid).get()
  if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { status } = await request.json()
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  await adminDb.collection('enquiries').doc(params.id).update({ status })
  return NextResponse.json({ id: params.id, status })
}
```

- [ ] **Step 2: Create admin dashboard**

Create `app/(admin)/dashboard/page.tsx`:
```tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { collection, getDocs } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/config'
import { type Enquiry } from '@/lib/firebase/firestore'
import { logout } from '@/lib/firebase/auth'

const STATUSES = ['new', 'reviewing', 'active', 'closed'] as const

export default function AdminDashboard() {
  const router = useRouter()
  const [enquiries, setEnquiries] = useState<Enquiry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push('/login'); return }
      const snapshot = await getDocs(collection(db, 'enquiries'))
      setEnquiries(snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Enquiry)))
      setLoading(false)
    })
  }, [router])

  async function updateStatus(id: string, status: string) {
    // All Firestore writes go through the API route (Admin SDK) — never the client SDK
    await fetch(`/api/enquiries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setEnquiries((prev) => prev.map((e) => e.id === id ? { ...e, status: status as Enquiry['status'] } : e))
  }

  async function handleLogout() {
    await logout()
    router.push('/')
  }

  return (
    <main className="relative z-10 pt-32 pb-24 px-8 md:px-16 min-h-screen">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-16">
          <h1 className="font-headline text-4xl font-bold tracking-tighter">Admin — All Enquiries</h1>
          <button onClick={handleLogout} className="text-white/40 hover:text-white text-sm transition-colors">Sign out</button>
        </div>
        {loading ? (
          <p className="text-white/40">Loading...</p>
        ) : (
          <div className="space-y-4">
            {enquiries.map((enq) => (
              <div key={enq.id} className="glass-card p-8">
                <div className="flex flex-col md:flex-row justify-between gap-4">
                  <div className="flex-1">
                    <p className="font-headline font-bold text-lg mb-1">{enq.name} <span className="text-white/40 font-normal text-sm">— {enq.email}</span></p>
                    <p className="text-white/50 text-xs uppercase tracking-widest mb-3">{enq.projectType} · {enq.company}</p>
                    <p className="text-white/60 text-sm">{enq.details.slice(0, 200)}</p>
                  </div>
                  <div className="flex flex-col gap-2 min-w-[160px]">
                    <label className="font-headline text-[0.65rem] uppercase tracking-widest text-white/40">Status</label>
                    <select
                      value={enq.status}
                      onChange={(e) => updateStatus(enq.id, e.target.value)}
                      className="bg-transparent border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-white"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s} className="bg-neutral-900">{s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Manually test admin dashboard**

1. In Firestore, set your user doc's `role` to `"admin"`
2. Visit http://localhost:3000/admin/dashboard — verify all enquiries appear
3. Change a status — verify it updates in Firestore and the PATCH API route responds 200

- [ ] **Step 4: Commit**

```bash
git add "app/(admin)/" "app/api/enquiries/[id]/"
git commit -m "feat: add admin dashboard and PATCH enquiry status API route"
```

---

## Task 15: SEO — Metadata, Sitemap, Robots

**Files:**
- Modify: each `app/(public)/*/page.tsx` (metadata already added in Tasks 3–7)
- Create: `app/sitemap.ts`
- Create: `app/robots.ts`

- [ ] **Step 1: Create sitemap**

Create `app/sitemap.ts`:
```typescript
import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://partnersinbiz.com'
  return [
    { url: base, lastModified: new Date(), changeFrequency: 'monthly', priority: 1 },
    { url: `${base}/about`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/our-process`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/discover`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/start-a-project`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.9 },
  ]
}
```

- [ ] **Step 2: Create robots.txt**

Create `app/robots.ts`:
```typescript
import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/portal/', '/admin/', '/api/', '/login', '/register'],
    },
    sitemap: 'https://partnersinbiz.com/sitemap.xml',
  }
}
```

- [ ] **Step 3: Verify SEO outputs**

- Open http://localhost:3000/sitemap.xml — verify 5 URLs listed
- Open http://localhost:3000/robots.txt — verify disallow rules present
- View page source of http://localhost:3000 — verify `<title>` and `<meta name="description">` tags

- [ ] **Step 4: Commit**

```bash
git add app/sitemap.ts app/robots.ts
git commit -m "feat: add sitemap and robots.txt for SEO"
```

---

## Task 16: Firestore Security Rules

**Files:**
- Create: `firestore.rules`

- [ ] **Step 1: Write the security rules file**

Create `firestore.rules`:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{uid} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow create: if request.auth != null
                    && request.auth.uid == uid
                    && request.resource.data.role == "client";
      allow update: if request.auth != null
                    && request.auth.uid == uid
                    && !request.resource.data.diff(resource.data).affectedKeys().hasAny(["role"]);
    }

    match /enquiries/{id} {
      allow read: if request.auth != null
                  && (
                    request.auth.uid == resource.data.userId
                    || get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin"
                  );
      allow write: if false;
    }
  }
}
```

- [ ] **Step 2: Deploy rules to Firebase**

```bash
npx firebase-tools deploy --only firestore:rules
```
Expected: "Deploy complete!" with rules deployed.

> If `firebase-tools` is not installed: `npm install -g firebase-tools` then `firebase login`.

- [ ] **Step 3: Verify rules**

In Firebase Console → Firestore → Rules, confirm the rules are deployed.
Run the Firestore Rules Simulator to verify:
- Client can read their own enquiry ✅
- Client cannot read another user's enquiry ✅
- Client cannot write to enquiries ✅
- Admin can read all enquiries ✅

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "feat: add Firestore security rules"
```

---

## Task 17: Final Verification

- [ ] **Step 1: Run all tests**

```bash
npx jest
```
Expected: All tests pass.

- [ ] **Step 2: Full manual smoke test**

| Scenario | Expected |
|---|---|
| Visit `/` | Landing page matches stitch screenshot |
| Visit `/about` | About page matches stitch screenshot |
| Visit `/our-process` | Process page matches stitch screenshot |
| Visit `/discover` | Discover page matches stitch screenshot |
| Visit `/start-a-project` | Form page matches stitch screenshot |
| Submit form (not logged in) | Success state, enquiry in Firestore, email sent |
| Visit `/portal/dashboard` unauthenticated | Redirect to /login |
| Register new account | Redirect to /portal/dashboard |
| Visit `/admin/dashboard` as client | Redirect to /portal/dashboard |
| Promote user to admin in Firestore, visit `/admin/dashboard` | All enquiries listed |
| Change enquiry status in admin dashboard | Firestore doc updated |
| Visit `/sitemap.xml` | 5 URLs listed |
| View page source of `/` | Correct title and meta description |

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete PartnersInBiz Next.js app"
```
