# PartnersInBiz React App — Design Spec

**Date:** 2026-03-20
**Status:** Approved

---

## 1. Overview

Convert the existing Stitch-generated HTML pages into a production-ready Next.js web application. The app must be pixel-perfect to the existing stitch designs, SEO-optimised, and include Firebase-backed authentication, a lead capture system, and role-based portals for clients and admins.

---

## 2. Stack

| Concern | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Styling | Tailwind CSS (exact config from stitch files) |
| Auth & Database | Firebase Auth + Firestore + Firebase Admin SDK |
| Email | Resend |
| Language | TypeScript |

---

## 3. Pages

Five pages are converted from the stitch HTML files to React components. Each page must match the stitch design exactly, including fonts, colours, glassmorphism effects, and spacing.

| Stitch Folder | Route |
|---|---|
| `pib_landing_page` | `/` |
| `pib_about_us` | `/about` |
| `pib_our_process` | `/our-process` |
| `pib_discover_phase` | `/discover` |
| `pib_start_a_project` | `/start-a-project` |

> **Note:** The `pib_mono_precision` folder contains only `DESIGN.md` — the design system reference document. It is not a page to convert.

---

## 4. Project Structure

```
partnersinbiz/
├── app/
│   ├── (public)/
│   │   ├── page.tsx                    # Landing page
│   │   ├── about/page.tsx
│   │   ├── our-process/page.tsx
│   │   ├── discover/page.tsx
│   │   └── start-a-project/page.tsx    # Lead capture form
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (portal)/
│   │   └── dashboard/page.tsx          # Client portal
│   ├── (admin)/
│   │   └── dashboard/page.tsx          # Admin area
│   ├── api/
│   │   ├── auth/session/route.ts       # Creates Firebase session cookie
│   │   └── enquiries/route.ts          # Form submission endpoint
│   └── layout.tsx                      # Root layout (fonts, Tailwind, nav)
├── components/
│   ├── ui/                             # Reusable UI primitives
│   └── layout/                         # Navbar, footer
├── lib/
│   └── firebase/
│       ├── config.ts                   # Firebase client app init
│       ├── admin.ts                    # Firebase Admin SDK init (server-only)
│       ├── auth.ts                     # Auth helpers
│       └── firestore.ts               # Firestore helpers
├── middleware.ts                       # Route protection via session cookie
└── tailwind.config.ts                 # Exact config from stitch files
```

---

## 5. Design System

The stitch files use the "Monolithic Glasshouse" design system:

- **Palette:** Pure black `#000` background, pure white `#fff` text/elements
- **Glass cards:** `bg-white/[0.03]` · `backdrop-blur-2xl` · `border border-white/[0.15]` · `backdrop-saturate-[1.8]` · `rounded-2xl`
- **Fonts:** Space Grotesk (headlines) + Inter (body/labels) via `next/font/google`
- **Icons:** Material Symbols Outlined
- **No dividers:** Sections separated by vertical void (spacing) only

The Tailwind config from the stitch files is ported verbatim into `tailwind.config.ts`. Note: the config includes many Material Design color tokens that are not referenced in any class — these are harmless and can be kept as-is.

### Background Video

Two pages (`/` and `/start-a-project`) use a background video hosted on CloudFront (`d8j0ntlcm91z4.cloudfront.net`). For the initial build, use the CloudFront URL directly. If the URL becomes unstable, copy the video to `/public/video/bg.mp4`. Always provide a solid black fallback background for when the video fails to load or on slow connections.

---

## 6. Authentication

### Provider
Firebase Auth — email/password. Google OAuth can be added later without architectural changes.

### Session Cookie Flow (required for middleware)
Firebase Auth defaults to localStorage — middleware cannot read it server-side. We use Firebase session cookies instead:

1. User logs in on the client via Firebase Auth SDK (`signInWithEmailAndPassword`)
2. Client calls `POST /api/auth/session` with the Firebase ID token
3. API route uses **Firebase Admin SDK** to verify the token and call `auth().createSessionCookie(idToken, { expiresIn })`, setting a secure HttpOnly cookie named `__session`
4. `middleware.ts` reads `__session` on every request, verifies it with Admin SDK (`auth().verifySessionCookie()`), and enforces route protection
5. On logout, client calls `DELETE /api/auth/session` to clear the cookie

### Roles
Stored in Firestore `users/{uid}`:

| Role | Access |
|---|---|
| `client` | `/portal/*` |
| `admin` | `/portal/*` + `/admin/*` |

Clients receive the `client` role automatically when their Firestore user doc is created at registration. Admins are promoted manually by setting `role: "admin"` directly in Firestore.

### Route Protection
`middleware.ts` enforces:
- Unauthenticated users → redirected to `/login` for any `/portal/*` or `/admin/*` route
- Clients accessing `/admin/*` → redirected to `/portal/dashboard`

### Auth Pages
- `/login` — email + password login
- `/register` — new client registration (creates Firestore user doc with `role: "client"`)

---

## 7. Lead Capture Form

**Route:** `/start-a-project`

**Form fields** (exact match to stitch HTML):
- Full Name (text, required)
- Email Address (email, required)
- Company Name (text)
- Project Type (select, required):
  | Label | Stored value |
  |---|---|
  | Web Development | `"web"` |
  | Mobile App | `"mobile"` |
  | AI Solution | `"ai"` |
  | Product Design | `"design"` |
- Project Details (textarea — scope, timeline, and objectives, required)

**Submission flow:**
1. Client submits form → `POST /api/enquiries`
2. API route validates input server-side
3. Enquiry saved to Firestore `enquiries/{id}`
4. Notification email sent to admin via Resend

**Firestore enquiry document:**
```
enquiries/{id}
├── userId: string | null       # Firebase uid if the submitter is logged in
├── name: string
├── email: string
├── company: string
├── projectType: string         # "web" | "mobile" | "ai" | "design"
├── details: string             # scope, timeline, and objectives
├── status: "new" | "reviewing" | "active" | "closed"
├── createdAt: Timestamp
└── assignedTo: string | null   # admin uid, set later
```

---

## 8. Portals

### Client Portal — `/portal/dashboard`
- Requires authentication (any role)
- Queries Firestore `enquiries` where `userId == currentUser.uid`
- Shows enquiry status read-only

### Admin Dashboard — `/admin/dashboard`
- Requires `admin` role
- Lists all enquiries
- Admin can update `status` and set `assignedTo`

**Scope note:** The portal and admin work adds complexity. This is intentional — the business requires a way to track and communicate project progress to clients, and managing enquiries in Firestore rather than email keeps the team organised from day one.

---

## 9. Firestore Security Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Users can read/write their own doc, but cannot change their role
    match /users/{uid} {
      allow read: if request.auth.uid == uid;
      allow create: if request.auth.uid == uid
                    && request.resource.data.role == "client";
      allow update: if request.auth.uid == uid
                    && !request.resource.data.diff(resource.data).affectedKeys().hasAny(["role"]);
    }

    // Enquiries: only server (Admin SDK) can write via API routes
    // Clients can read their own enquiries; admins can read all
    match /enquiries/{id} {
      allow read: if request.auth.uid == resource.data.userId
                  || get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "admin";
      allow write: if false; // all writes go through the API route using Admin SDK
    }
  }
}
```

---

## 10. SEO

- All public pages are React Server Components (rendered server-side)
- `generateMetadata` per page for `<title>` and `<meta name="description">`
- `sitemap.xml` and `robots.txt` via Next.js built-in support (`app/sitemap.ts`, `app/robots.ts`)
- Fonts loaded via `next/font/google` (eliminates layout shift, self-hosts font files)

---

## 11. Environment Variables

```
# Firebase client SDK (safe to expose — NEXT_PUBLIC prefix)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Firebase Admin SDK (server-only — never expose to client)
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=        # from service account JSON

# Resend
RESEND_API_KEY=
RESEND_FROM_ADDRESS=               # e.g. noreply@partnersinbiz.com
ADMIN_NOTIFICATION_EMAIL=          # email that receives lead notifications

# Session
SESSION_COOKIE_NAME=__session
SESSION_EXPIRY_DAYS=14
```

All server-only variables must never be prefixed with `NEXT_PUBLIC_`. Store in `.env.local` locally, and in Vercel environment variables in production.

---

## 12. Deployment

- **Platform:** Vercel (native Next.js support, automatic SSR, edge middleware)
- **Firebase project:** Create two Firebase projects — `partnersinbiz-dev` and `partnersinbiz-prod` — with separate Firestore databases and Auth instances
- **Environment promotion:** `.env.local` for local dev; Vercel project settings for production (separate environment variable sets per environment)
- **Domains:** Configure custom domain in Vercel dashboard after first deploy

---

## 13. Testing

- **Design fidelity:** Manual browser review of each page against the stitch screenshots (`screen.png` in each stitch folder)
- **API routes:** Unit tests for `/api/enquiries` input validation (valid submission, missing required fields, invalid email)
- **Auth flow:** Manual testing of login, register, logout, role-based redirect
- **No automated E2E tests in initial scope** — can be added with Playwright later
