'use client'

import React, { useState } from 'react'
import type { PreviewSocialPost, PreviewBrand } from './types'
import {
  PreviewImage,
  getFirstImage,
  getFirstVideo,
  HighlightedText,
  withHashtags,
  relativeTime,
  compactCount,
} from './utils'

export interface LinkedInPostCardProps {
  post: PreviewSocialPost
  brand?: PreviewBrand
}

export function LinkedInPostCard({ post, brand }: LinkedInPostCardProps) {
  const [expanded, setExpanded] = useState(false)
  const image = getFirstImage(post.media)
  const video = getFirstVideo(post.media)
  const name = post.authorName || brand?.name || 'Your Brand'
  const headline = post.authorHeadline || 'Helping businesses grow · Partners in Biz'
  const time = relativeTime(post.scheduledFor)
  const accent = brand?.palette.accent || '#0A66C2'
  const fullCaption = withHashtags(post.content, post.hashtags)
  const isLong = fullCaption.length > 240
  const visible = !expanded && isLong ? fullCaption.slice(0, 240).trimEnd() : fullCaption

  return (
    <div
      style={{
        width: '100%',
        background: '#fff',
        color: '#000000E6',
        borderRadius: 8,
        border: '1px solid #e0e0e0',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.05)',
        overflow: 'hidden',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        fontSize: 14,
      }}
    >
      {/* header */}
      <div style={{ padding: '12px 16px', display: 'flex', gap: 10 }}>
        <div
          style={{
            width: 48,
            height: 48,
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
          <div style={{ fontWeight: 600, fontSize: 14 }}>{name}</div>
          <div style={{ color: 'rgba(0,0,0,0.6)', fontSize: 12, lineHeight: 1.3 }}>{headline}</div>
          <div style={{ color: 'rgba(0,0,0,0.6)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>{time} ·</span>
            <span>🌐</span>
          </div>
        </div>
        <div style={{ fontSize: 22, color: 'rgba(0,0,0,0.6)', cursor: 'pointer' }}>···</div>
      </div>

      {/* body */}
      <div style={{ padding: '0 16px 12px', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
        <HighlightedText text={visible} linkColor={accent} />
        {!expanded && isLong && (
          <>
            …{' '}
            <button
              onClick={() => setExpanded(true)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'rgba(0,0,0,0.6)',
                cursor: 'pointer',
                font: 'inherit',
              }}
            >
              see more
            </button>
          </>
        )}
      </div>

      {/* media */}
      {video ? (
        <video src={video.url} poster={video.thumbnailUrl} controls style={{ width: '100%', display: 'block', background: '#000' }} />
      ) : image ? (
        <PreviewImage src={image.url} alt={image.alt} style={{ width: '100%', maxHeight: 600, display: 'block' }} />
      ) : null}

      {/* counts */}
      <div
        style={{
          padding: '8px 16px',
          fontSize: 12,
          color: 'rgba(0,0,0,0.6)',
          display: 'flex',
          borderBottom: '1px solid #e0e0e0',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          <span style={{ background: accent, color: '#fff', borderRadius: '50%', width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>👍</span>
          <span style={{ background: '#DF704D', color: '#fff', borderRadius: '50%', width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, marginLeft: -4 }}>❤</span>
          <span style={{ background: '#F5BB5C', color: '#fff', borderRadius: '50%', width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, marginLeft: -4 }}>💡</span>
          <span style={{ marginLeft: 6 }}>{compactCount(post.likeCount ?? 184)}</span>
        </span>
        <span style={{ flex: 1 }} />
        <span>
          {compactCount(post.commentCount ?? 24)} comments · {compactCount(post.shareCount ?? 8)} reposts
        </span>
      </div>

      {/* actions */}
      <div style={{ display: 'flex', padding: 4, color: 'rgba(0,0,0,0.6)' }}>
        {[
          { icon: '👍', label: 'Like' },
          { icon: '💬', label: 'Comment' },
          { icon: '🔁', label: 'Repost' },
          { icon: '➤', label: 'Send' },
        ].map((b) => (
          <button
            key={b.label}
            style={{
              flex: 1,
              padding: '10px 6px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              color: 'rgba(0,0,0,0.6)',
              fontSize: 13,
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

export default LinkedInPostCard
