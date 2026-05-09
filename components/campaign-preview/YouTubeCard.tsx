'use client'

import React from 'react'
import type { PreviewSocialPost, PreviewBrand } from './types'
import {
  PreviewImage,
  getFirstVideo,
  getFirstImage,
  formatDuration,
  compactCount,
  relativeTime,
} from './utils'

export interface YouTubeCardProps {
  post: PreviewSocialPost
  brand?: PreviewBrand
}

export function YouTubeCard({ post, brand }: YouTubeCardProps) {
  const video = getFirstVideo(post.media)
  const image = getFirstImage(post.media)
  const thumb = video?.thumbnailUrl || image?.url
  const text = (typeof post.content === 'string'
    ? post.content
    : (post.content && typeof (post.content as { text?: string }).text === 'string'
        ? (post.content as { text: string }).text
        : '')) as string
  const title = post.videoTitle || text.split('\n')[0] || 'Untitled video'
  const channel = post.channelName || post.authorName || 'Your Brand'
  const channelAvatar = post.channelAvatarUrl || post.authorAvatarUrl || brand?.logoUrl
  const time = relativeTime(post.scheduledFor)

  return (
    <div
      style={{
        width: 380,
        background: 'transparent',
        color: '#0F0F0F',
        fontFamily: 'Roboto, system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      {/* thumbnail */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          background: '#000',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        {video ? (
          <video
            src={video.urlYoutube || video.url}
            poster={thumb}
            controls
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <PreviewImage src={thumb} alt={title} style={{ width: '100%', height: '100%' }} />
        )}
        {video?.durationSec ? (
          <div
            style={{
              position: 'absolute',
              right: 8,
              bottom: 8,
              background: 'rgba(0,0,0,0.85)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              padding: '2px 4px',
              borderRadius: 4,
            }}
          >
            {formatDuration(video.durationSec)}
          </div>
        ) : null}
      </div>

      {/* meta */}
      <div style={{ display: 'flex', gap: 12, padding: '12px 4px 4px' }}>
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
          <PreviewImage src={channelAvatar} alt={channel} style={{ width: '100%', height: '100%' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 15,
              lineHeight: 1.35,
              color: '#0F0F0F',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: 13, color: '#606060', marginTop: 4 }}>{channel}</div>
          <div style={{ fontSize: 13, color: '#606060' }}>
            {compactCount(post.viewCount ?? 12400)} views · {time} ago
          </div>
        </div>
      </div>
    </div>
  )
}

export default YouTubeCard
