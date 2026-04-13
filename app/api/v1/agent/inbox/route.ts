/**
 * GET /api/v1/agent/inbox — Poll for unactioned comments from tasks and social posts
 *
 * AI agents call this endpoint to retrieve all comments that haven't been processed yet.
 * Agents authenticate with AI_API_KEY header.
 *
 * Query params:
 *  - source: 'task' | 'social_post' — filter by comment source (optional)
 *  - limit: number — max results (default 50, max 200)
 *  - includeHandled: boolean — include already-handled comments (default false, for debugging)
 */
import { NextRequest } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { withAuth } from '@/lib/api/auth'
import { apiSuccess, apiError } from '@/lib/api/response'

export const dynamic = 'force-dynamic'

interface InboxComment {
  id: string
  text: string
  userId: string
  userName: string
  userRole: 'admin' | 'client' | 'ai'
  createdAt: unknown
  source: 'task' | 'social_post'
  // For tasks:
  projectId?: string
  taskId?: string
  // For social posts:
  postId?: string
  // Mark-as-handled endpoint
  markHandledUrl: string
}

interface InboxResponse {
  comments: InboxComment[]
  total: number
}

export const GET = withAuth('admin', async (req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url)
    const source = searchParams.get('source') as 'task' | 'social_post' | null
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200)
    const includeHandled = searchParams.get('includeHandled') === 'true'

    // Query all comments using collectionGroup
    // This queries all subcollections named 'comments' across the entire database
    let baseQuery = adminDb.collectionGroup('comments') as any

    if (!includeHandled) {
      baseQuery = baseQuery.where('agentPickedUp', '==', false)
    }

    let snapshot
    try {
      // Try to order by createdAt; if it fails (no composite index), catch and continue without ordering
      const queryWithOrder = baseQuery.orderBy('createdAt', 'asc')
      snapshot = await queryWithOrder.limit(limit).get()
    } catch (err: any) {
      // If ordering fails due to missing index, fetch without ordering
      if (err.code === 'failed-precondition' || err.message?.includes('index')) {
        snapshot = await baseQuery.limit(limit).get()
      } else {
        throw err
      }
    }

    const comments: InboxComment[] = []

    snapshot.docs.forEach((doc: any) => {
      const docRef = doc.ref
      const path = docRef.path
      const data = doc.data()

      // Determine source and extract IDs from the path
      // Path format: projects/{projectId}/tasks/{taskId}/comments/{commentId}
      //         or: social_posts/{postId}/comments/{commentId}
      let commentSource: 'task' | 'social_post'
      let projectId: string | undefined
      let taskId: string | undefined
      let postId: string | undefined
      let markHandledUrl: string

      if (path.includes('social_posts')) {
        commentSource = 'social_post'
        const parts = path.split('/')
        // Path: social_posts/{postId}/comments/{commentId}
        const postIdIndex = parts.indexOf('social_posts') + 1
        const commentIdIndex = parts.indexOf('comments') + 1
        postId = parts[postIdIndex]
        const commentId = parts[commentIdIndex]
        markHandledUrl = `/api/v1/social/posts/${postId}/comments/${commentId}`
      } else if (path.includes('tasks')) {
        commentSource = 'task'
        const parts = path.split('/')
        // Path: projects/{projectId}/tasks/{taskId}/comments/{commentId}
        const projectIdIndex = parts.indexOf('projects') + 1
        const taskIdIndex = parts.indexOf('tasks') + 1
        const commentIdIndex = parts.indexOf('comments') + 1
        projectId = parts[projectIdIndex]
        taskId = parts[taskIdIndex]
        const commentId = parts[commentIdIndex]
        markHandledUrl = `/api/v1/projects/${projectId}/tasks/${taskId}/comments/${commentId}`
      } else {
        // Unknown source, skip
        return
      }

      // Filter by source if specified
      if (source && commentSource !== source) {
        return
      }

      const comment: InboxComment = {
        id: doc.id,
        text: data.text,
        userId: data.userId,
        userName: data.userName,
        userRole: data.userRole || 'client',
        createdAt: data.createdAt,
        source: commentSource,
        markHandledUrl,
      }

      // Add optional IDs based on source
      if (commentSource === 'task') {
        comment.projectId = projectId
        comment.taskId = taskId
      } else {
        comment.postId = postId
      }

      comments.push(comment)
    })

    const response: InboxResponse = {
      comments,
      total: comments.length,
    }

    return apiSuccess(response)
  } catch (err) {
    console.error('Error fetching inbox comments:', err)
    return apiError('Failed to fetch inbox comments', 500)
  }
})
