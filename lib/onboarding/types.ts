// lib/onboarding/types.ts
// Shared types for product onboarding submissions.

export interface Coach {
  name:     string
  title:    string
  bio:      string
  photoUrl: string
}

export interface Program {
  name:        string
  description: string
  ageRange:    string
}

export interface Stat {
  value: string
  label: string
}

export interface AthleetSubmission {
  product: 'athleet-management'

  // Step 1 — Club Identity
  clubName:    string
  shortName:   string
  sport:       string
  tagline:     string
  city:        string
  state:       string
  country:     string
  foundedYear: string

  // Step 2 — Brand & Design
  primaryColor:   string
  secondaryColor: string
  accentColor:    string
  logoUrl:        string
  heroVideoUrl:   string

  // Step 3 — Contact
  address:      string
  phone:        string
  contactEmail: string
  timezone:     string
  currency:     string

  // Step 4 — Social
  facebook:  string
  instagram: string
  x:         string
  youtube:   string
  tiktok:    string

  // Step 5 — Coaches
  coaches: Coach[]

  // Step 6 — Programs
  programs: Program[]

  // Step 7 — Stats
  stats: Stat[]

  // Step 8 — Features
  enableRegistrations:      boolean
  enablePayments:           boolean
  enableScheduling:         boolean
  enableAthleteRecords:     boolean
  enableTournaments:        boolean
  enableParentPortal:       boolean
  enableEmailNotifications: boolean

  // Step 9 — Domain & Admin
  hasDomain:           boolean
  existingDomain:      string
  subdomainPreference: string
  adminName:           string
  adminEmail:          string
  adminPhone:          string
}

export type OnboardingSubmission = AthleetSubmission
