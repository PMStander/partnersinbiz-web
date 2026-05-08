'use client'

import React from 'react'
import type { PreviewBlog, PreviewBrand } from './types'
import { PreviewImage } from './utils'
import { renderMarkdown } from './markdown'

export interface BlogReaderCardProps {
  blog: PreviewBlog
  brand?: PreviewBrand
}

function formatDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function BlogReaderCard({ blog, brand }: BlogReaderCardProps) {
  const headingFont = brand?.typography?.heading || 'Instrument Serif, "Times New Roman", serif'
  const bodyFont = brand?.typography?.body || 'Geist, system-ui, -apple-system, sans-serif'
  const author = blog.authorName || 'Editorial team'
  const date = formatDate(blog.publishDate)
  const readTime =
    blog.readTimeMinutes ??
    (blog.draft?.wordCount ? Math.max(1, Math.round(blog.draft.wordCount / 220)) : null)

  return (
    <article
      style={{
        background: '#fff',
        color: '#1F1F1F',
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
        overflow: 'hidden',
        fontFamily: bodyFont,
        maxWidth: 720,
        width: '100%',
      }}
    >
      {/* hero */}
      {blog.heroImageUrl && (
        <div style={{ width: '100%', aspectRatio: '16 / 9', background: '#f3f4f6' }}>
          <PreviewImage
            src={blog.heroImageUrl}
            alt={blog.title}
            style={{ width: '100%', height: '100%', display: 'block' }}
          />
        </div>
      )}

      {/* content */}
      <div style={{ padding: '40px 56px 56px', maxWidth: 680, margin: '0 auto' }}>
        <h1
          style={{
            fontFamily: headingFont,
            fontWeight: 400,
            fontSize: 44,
            lineHeight: 1.15,
            margin: '0 0 18px',
            letterSpacing: '-0.01em',
          }}
        >
          {blog.title}
        </h1>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            color: '#6B6B6B',
            fontSize: 14,
            marginBottom: 36,
            paddingBottom: 24,
            borderBottom: '1px solid #eee',
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: '#e4e6eb',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            <PreviewImage src={blog.authorAvatarUrl} alt={author} style={{ width: '100%', height: '100%' }} />
          </div>
          <div>
            <div style={{ color: '#1F1F1F', fontWeight: 500 }}>{author}</div>
            <div>
              {date}
              {readTime ? ` · ${readTime} min read` : ''}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 18, lineHeight: 1.7, color: '#1F1F1F' }}>
          {renderMarkdown(blog.draft?.body || '')}
        </div>
      </div>
    </article>
  )
}

export default BlogReaderCard
