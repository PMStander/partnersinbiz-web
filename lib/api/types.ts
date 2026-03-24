export type ApiRole = 'admin' | 'client' | 'ai'

export interface ApiUser {
  uid: string
  role: ApiRole
}

export interface ApiMeta {
  total: number
  page: number
  limit: number
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  meta?: ApiMeta
}
