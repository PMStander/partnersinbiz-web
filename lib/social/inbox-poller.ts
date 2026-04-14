/**
 * Per-platform polling functions for fetching mentions, comments, and engagement.
 * Each function returns InboxPollResult[] representing new engagement items to add to the inbox.
 */

import { decryptTokenBlock } from './encryption'

export interface InboxPollResult {
  platformItemId: string
  type: 'mention' | 'comment' | 'reply' | 'dm'
  fromUser: { name: string; username: string; avatarUrl: string; profileUrl: string }
  content: string
  postId: string | null // our internal social_posts doc id if we can match it
  platformUrl: string
  createdAt: Date
}

interface PollAccount {
  platformAccountId: string
  accessToken: string
  username: string
}

/**
 * Twitter/X polling — Fetch mentions using the v2 API.
 * Requires TWITTER_BEARER_TOKEN env var (app-level bearer token).
 */
async function pollTwitter(account: PollAccount): Promise<InboxPollResult[]> {
  try {
    const bearerToken = process.env.TWITTER_BEARER_TOKEN
    if (!bearerToken) {
      console.warn('[twitter] TWITTER_BEARER_TOKEN not set, skipping')
      return []
    }

    // Get the user's ID from their username
    const userLookupUrl = new URL('https://api.twitter.com/2/users/by/username/' + account.username)
    const userRes = await fetch(userLookupUrl.toString(), {
      headers: { Authorization: `Bearer ${bearerToken}` },
    })

    if (!userRes.ok) {
      console.warn('[twitter] Failed to look up user ID:', userRes.status)
      return []
    }

    const userData = (await userRes.json()) as { data?: { id: string } }
    const userId = userData.data?.id
    if (!userId) {
      console.warn('[twitter] Could not find user ID for', account.username)
      return []
    }

    // Fetch mentions for this user (last 24 hours)
    const mentionsUrl = new URL(`https://api.twitter.com/2/users/${userId}/mentions`)
    mentionsUrl.searchParams.append('max_results', '10')
    mentionsUrl.searchParams.append('tweet.fields', 'created_at,author_id')
    mentionsUrl.searchParams.append('expansions', 'author_id')
    mentionsUrl.searchParams.append('user.fields', 'name,username,profile_image_url')

    // Calculate 24h ago timestamp
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    mentionsUrl.searchParams.append('start_time', yesterday)

    const res = await fetch(mentionsUrl.toString(), {
      headers: { Authorization: `Bearer ${bearerToken}` },
    })

    if (!res.ok) {
      console.warn('[twitter] Failed to fetch mentions:', res.status)
      return []
    }

    interface TwitterMentionResponse {
      data?: Array<{
        id: string
        text: string
        created_at: string
        author_id: string
      }>
      includes?: {
        users?: Array<{
          id: string
          name: string
          username: string
          profile_image_url?: string
        }>
      }
    }

    const data = (await res.json()) as TwitterMentionResponse
    if (!data.data) return []

    // Build a map of user IDs to user info
    const userMap: Record<string, (typeof data.includes.users)[0]> = {}
    if (data.includes?.users) {
      for (const u of data.includes.users) {
        userMap[u.id] = u
      }
    }

    const results: InboxPollResult[] = []
    for (const tweet of data.data) {
      const author = userMap[tweet.author_id]
      if (!author) continue

      results.push({
        platformItemId: tweet.id,
        type: 'mention',
        fromUser: {
          name: author.name,
          username: author.username,
          avatarUrl: author.profile_image_url || '',
          profileUrl: `https://twitter.com/${author.username}`,
        },
        content: tweet.text,
        postId: null,
        platformUrl: `https://twitter.com/${author.username}/status/${tweet.id}`,
        createdAt: new Date(tweet.created_at),
      })
    }

    return results
  } catch (error) {
    console.error('[twitter] Polling error:', error)
    return []
  }
}

/**
 * LinkedIn polling — Stub implementation.
 * Full implementation requires webhook approval and complex URN encoding.
 */
async function pollLinkedIn(_account: PollAccount): Promise<InboxPollResult[]> {
  try {
    console.warn('[linkedin] Full polling not implemented; requires webhook approval')
    return []
  } catch (error) {
    console.error('[linkedin] Polling error:', error)
    return []
  }
}

/**
 * Facebook/Instagram polling — Fetch page feed with comments.
 */
async function pollFacebook(account: PollAccount): Promise<InboxPollResult[]> {
  try {
    const accessToken = account.accessToken
    if (!accessToken) {
      console.warn('[facebook] No access token provided')
      return []
    }

    const url = new URL(`https://graph.instagram.com/me/media`)
    url.searchParams.append('fields', 'id,caption,media_type,comments{message,from,timestamp,like_count}')
    url.searchParams.append('access_token', accessToken)

    const res = await fetch(url.toString())
    if (!res.ok) {
      console.warn('[facebook] Failed to fetch feed:', res.status)
      return []
    }

    interface FacebookMediaResponse {
      data?: Array<{
        id: string
        caption?: string
        comments?: {
          data?: Array<{
            id: string
            message: string
            from: { id: string; name: string; username?: string }
            timestamp: string
          }>
        }
      }>
    }

    const data = (await res.json()) as FacebookMediaResponse
    if (!data.data) return []

    const results: InboxPollResult[] = []
    const yesterday = Date.now() - 24 * 60 * 60 * 1000

    for (const media of data.data) {
      if (!media.comments?.data) continue

      for (const comment of media.comments.data) {
        const commentTime = new Date(comment.timestamp).getTime()
        if (commentTime < yesterday) continue

        results.push({
          platformItemId: comment.id,
          type: 'comment',
          fromUser: {
            name: comment.from.name,
            username: comment.from.username || comment.from.name,
            avatarUrl: '',
            profileUrl: `https://instagram.com/${comment.from.username || comment.from.id}`,
          },
          content: comment.message,
          postId: media.id,
          platformUrl: `https://instagram.com/p/${media.id}`,
          createdAt: new Date(comment.timestamp),
        })
      }
    }

    return results
  } catch (error) {
    console.error('[facebook] Polling error:', error)
    return []
  }
}

/**
 * Reddit polling — Fetch user's recent comments.
 * Public endpoint; user token optional but improves rate limits.
 */
async function pollReddit(account: PollAccount): Promise<InboxPollResult[]> {
  try {
    const username = account.username
    if (!username) {
      console.warn('[reddit] No username provided')
      return []
    }

    const url = `https://oauth.reddit.com/user/${username}/comments.json?limit=10`

    const headers: Record<string, string> = {
      'User-Agent': 'PartnersinBiz/1.0',
    }

    if (account.accessToken) {
      headers['Authorization'] = `Bearer ${account.accessToken}`
    }

    const res = await fetch(url, { headers })
    if (!res.ok) {
      console.warn('[reddit] Failed to fetch comments:', res.status)
      return []
    }

    interface RedditComment {
      kind: string
      data: {
        id: string
        body: string
        author: string
        created_utc: number
        parent_id: string
        permalink: string
        score: number
      }
    }

    interface RedditListingData {
      children: RedditComment[]
    }

    interface RedditListing {
      data: RedditListingData
    }

    const data = (await res.json()) as RedditListing
    if (!data.data?.children) return []

    const results: InboxPollResult[] = []
    const yesterday = Date.now() - 24 * 60 * 60 * 1000

    for (const item of data.data.children) {
      if (item.kind !== 't1') continue // t1 = comment
      const comment = item.data
      const commentTime = comment.created_utc * 1000

      if (commentTime < yesterday) continue

      results.push({
        platformItemId: comment.id,
        type: 'comment',
        fromUser: {
          name: comment.author,
          username: comment.author,
          avatarUrl: '',
          profileUrl: `https://reddit.com/user/${comment.author}`,
        },
        content: comment.body,
        postId: comment.parent_id,
        platformUrl: `https://reddit.com${comment.permalink}`,
        createdAt: new Date(commentTime),
      })
    }

    return results
  } catch (error) {
    console.error('[reddit] Polling error:', error)
    return []
  }
}

/**
 * YouTube polling — Fetch comment threads on the channel's videos.
 */
async function pollYouTube(account: PollAccount): Promise<InboxPollResult[]> {
  try {
    const accessToken = account.accessToken
    if (!accessToken) {
      console.warn('[youtube] No access token provided')
      return []
    }

    // Note: This requires the channel ID. For simplicity, we fetch from search.list
    // In production, you'd want to store the channel ID with the social account.
    const url = new URL('https://www.googleapis.com/youtube/v3/commentThreads')
    url.searchParams.append('part', 'snippet')
    url.searchParams.append('allThreadsRelatedToChannelId', account.platformAccountId)
    url.searchParams.append('moderationStatus', 'published')
    url.searchParams.append('maxResults', '20')
    url.searchParams.append('access_token', accessToken)

    const res = await fetch(url.toString())
    if (!res.ok) {
      console.warn('[youtube] Failed to fetch comments:', res.status)
      return []
    }

    interface YouTubeComment {
      snippet: {
        videoId: string
        topLevelComment: {
          id: string
          snippet: {
            textDisplay: string
            authorDisplayName: string
            authorProfileImageUrl: string
            authorChannelUrl: string
            publishedAt: string
          }
        }
      }
    }

    interface YouTubeResponse {
      items?: YouTubeComment[]
    }

    const data = (await res.json()) as YouTubeResponse
    if (!data.items) return []

    const results: InboxPollResult[] = []
    const yesterday = Date.now() - 24 * 60 * 60 * 1000

    for (const item of data.items) {
      const comment = item.snippet.topLevelComment.snippet
      const publishedTime = new Date(comment.publishedAt).getTime()

      if (publishedTime < yesterday) continue

      results.push({
        platformItemId: item.snippet.topLevelComment.id,
        type: 'comment',
        fromUser: {
          name: comment.authorDisplayName,
          username: comment.authorDisplayName,
          avatarUrl: comment.authorProfileImageUrl,
          profileUrl: comment.authorChannelUrl,
        },
        content: comment.textDisplay,
        postId: item.snippet.videoId,
        platformUrl: `https://youtube.com/watch?v=${item.snippet.videoId}`,
        createdAt: new Date(comment.publishedAt),
      })
    }

    return results
  } catch (error) {
    console.error('[youtube] Polling error:', error)
    return []
  }
}

/**
 * Bluesky polling — Fetch notifications.
 * Requires user access token.
 */
async function pollBluesky(account: PollAccount): Promise<InboxPollResult[]> {
  try {
    const accessToken = account.accessToken
    if (!accessToken) {
      console.warn('[bluesky] No access token provided')
      return []
    }

    const url = 'https://public.api.bsky.app/xrpc/app.bsky.notification.listNotifications'
    const headers = {
      Authorization: `Bearer ${accessToken}`,
    }

    const res = await fetch(url, { headers })
    if (!res.ok) {
      console.warn('[bluesky] Failed to fetch notifications:', res.status)
      return []
    }

    interface BlueskyNotification {
      uri: string
      cid: string
      author: {
        handle: string
        displayName?: string
        avatar?: string
      }
      record: {
        text?: string
      }
      indexedAt: string
    }

    interface BlueskyResponse {
      notifications?: BlueskyNotification[]
    }

    const data = (await res.json()) as BlueskyResponse
    if (!data.notifications) return []

    const results: InboxPollResult[] = []
    const yesterday = Date.now() - 24 * 60 * 60 * 1000

    for (const notif of data.notifications) {
      const notifTime = new Date(notif.indexedAt).getTime()

      if (notifTime < yesterday) continue

      results.push({
        platformItemId: notif.cid,
        type: 'mention',
        fromUser: {
          name: notif.author.displayName || notif.author.handle,
          username: notif.author.handle,
          avatarUrl: notif.author.avatar || '',
          profileUrl: `https://bsky.app/profile/${notif.author.handle}`,
        },
        content: notif.record.text || '',
        postId: null,
        platformUrl: notif.uri,
        createdAt: new Date(notif.indexedAt),
      })
    }

    return results
  } catch (error) {
    console.error('[bluesky] Polling error:', error)
    return []
  }
}

/**
 * Generic fallback for unsupported platforms.
 */
async function pollGeneric(_account: PollAccount): Promise<InboxPollResult[]> {
  return []
}

/**
 * Main dispatcher — calls the appropriate poller based on platform.
 */
export async function pollPlatform(
  platform: string,
  account: PollAccount,
): Promise<InboxPollResult[]> {
  const normalized = platform.toLowerCase()

  switch (normalized) {
    case 'twitter':
    case 'x':
      return pollTwitter(account)
    case 'linkedin':
      return pollLinkedIn(account)
    case 'facebook':
    case 'instagram':
      return pollFacebook(account)
    case 'reddit':
      return pollReddit(account)
    case 'youtube':
      return pollYouTube(account)
    case 'bluesky':
      return pollBluesky(account)
    default:
      return pollGeneric(account)
  }
}
