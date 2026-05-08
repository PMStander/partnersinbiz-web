'use client'

import React from 'react'
import type { PreviewSocialPost, PreviewBrand } from './types'
import { PreviewImage, getFirstImage, getFirstVideo, HighlightedText, withHashtags, relativeTime, compactCount } from './utils'

export interface FacebookFeedCardProps {
  post: PreviewSocialPost
  brand?: PreviewBrand
}

export function FacebookFeedCard({ post, brand }: FacebookFeedCardProps) {
  const image = getFirstImage(post.media)
  const video = getFirstVideo(post.media)
  const name = post.authorName || 'Your Brand'
  const time = relativeTime(post.scheduledFor)
  const accent = brand?.palette.accent || '#1877F2'
  const fullCaption = withHashtags(post.content, post.hashtags)

  return (
    <div
      style={{
        width: 500,
        background: '#fff',
        color: '#050505',
        borderRadius: 8,
        boxShadow: '0 1px 2px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.08)',
        overflow: 'hidden',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        fontSize: 15,
      }}
    >
      {/* header */}
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: '#e4e6eb',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <PreviewImage
            src={post.authorAvatarUrl || brand?.logoUrl}
            alt={name}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <strong style={{ fontWeight: 600, fontSize: 15 }}>{name}</strong>
            <span style={{ color: accent, fontSize: 14 }}>✓</span>
          </div>
          <div style={{ color: '#65676B', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>{time} ·</span>
            <span>🌐</span>
          </div>
        </div>
        <div style={{ fontSize: 22, color: '#65676B', cursor: 'pointer' }}>···</div>
      </div>

      {/* body */}
      <div style={{ padding: '0 16px 12px', fontSize: 15, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
        <HighlightedText text={fullCaption} linkColor={accent} />
      </div>

      {/* media */}
      {video ? (
        <video
          src={video.url}
          poster={video.thumbnailUrl}
          controls
          style={{ width: '100%', display: 'block', background: '#000' }}
        />
      ) : image ? (
        <PreviewImage
          src={image.url}
          alt={image.alt}
          style={{ width: '100%', maxHeight: 600, display: 'block' }}
        />
      ) : null}

      {/* reaction summary */}
      <div
        style={{
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          fontSize: 13,
          color: '#65676B',
          borderBottom: '1px solid #ced0d4',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ background: accent, color: '#fff', borderRadius: '50%', width: 18, height: 18, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>👍</span>
          <span>❤️</span>
          <span style={{ marginLeft: 4 }}>{compactCount(post.likeCount ?? 248)}</span>
        </span>
        <span style={{ flex: 1 }} />
        <span>{compactCount(post.commentCount ?? 32)} comments · {compactCount(post.shareCount ?? 12)} shares</span>
      </div>

      {/* action row */}
      <div
        style={{
          display: 'flex',
          padding: 4,
          fontSize: 14,
          fontWeight: 600,
          color: '#65676B',
        }}
      >
        {[
          { icon: '👍', label: 'Like' },
          { icon: '💬', label: 'Comment' },
          { icon: '↗', label: 'Share' },
        ].map((b) => (
          <button
            key={b.label}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              color: '#65676B',
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            <span>{b.icon}</span>
            <span>{b.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default FacebookFeedCard
