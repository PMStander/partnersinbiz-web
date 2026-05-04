'use client'

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body style={{ background: '#0a0a0b', color: '#fff', fontFamily: 'sans-serif', padding: '2rem' }}>
        <h2>Something went wrong</h2>
        {process.env.NODE_ENV === 'development' && <pre style={{ fontSize: '0.8rem', opacity: 0.6 }}>{error.message}</pre>}
      </body>
    </html>
  )
}
