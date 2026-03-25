import { apiSuccess, apiError } from '@/lib/api/response'

describe('apiSuccess', () => {
  it('returns 200 with success:true and data', async () => {
    const res = apiSuccess({ id: '1' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ success: true, data: { id: '1' } })
  })

  it('accepts a custom status code', async () => {
    const res = apiSuccess({ id: '1' }, 201)
    expect(res.status).toBe(201)
  })

  it('includes meta when provided', async () => {
    const res = apiSuccess([], 200, { total: 50, page: 1, limit: 10 })
    const body = await res.json()
    expect(body.meta).toEqual({ total: 50, page: 1, limit: 10 })
  })
})

describe('apiError', () => {
  it('returns given status with success:false and error message', async () => {
    const res = apiError('Not found', 404)
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toEqual({ success: false, error: 'Not found' })
  })

  it('defaults to 400 status', async () => {
    const res = apiError('Bad input')
    expect(res.status).toBe(400)
  })
})
