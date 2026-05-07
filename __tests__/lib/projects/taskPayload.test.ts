import {
  buildProjectTaskCreateData,
  buildProjectTaskUpdateData,
  taskOrderMillis,
} from '@/lib/projects/taskPayload'

describe('project task payload helpers', () => {
  it('keeps rich task creation fields for project kanban tasks', () => {
    const result = buildProjectTaskCreateData(
      {
        title: 'Ship new client portal',
        description: 'Acceptance criteria included.',
        columnId: 'in_progress',
        priority: 'high',
        order: 42,
        labels: ['client', 'blocked', 'client'],
        assigneeIds: ['user-1', 'user-2', 'user-1'],
        mentionIds: ['user-2'],
        dueDate: '2026-05-12',
        startDate: '2026-05-08',
        estimateMinutes: 180,
        checklist: [{ id: 'check-1', text: 'Confirm scope', done: false }],
        attachments: [{
          uploadId: 'upload-1',
          url: 'https://storage.googleapis.com/test-bucket/projects/p/tasks/screen.png',
          name: 'screen.png',
          size: 1200,
          mimeType: 'image/png',
        }],
      },
      'project-1',
      'org-1',
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual(expect.objectContaining({
      orgId: 'org-1',
      projectId: 'project-1',
      columnId: 'in_progress',
      title: 'Ship new client portal',
      priority: 'high',
      labels: ['client', 'blocked'],
      assigneeId: 'user-1',
      assigneeIds: ['user-1', 'user-2'],
      mentionIds: ['user-2'],
      dueDate: '2026-05-12',
      startDate: '2026-05-08',
      estimateMinutes: 180,
    }))
    expect(result.value.attachments).toEqual([
      expect.objectContaining({ uploadId: 'upload-1', mimeType: 'image/png' }),
    ])
    expect(result.value.checklist).toEqual([
      { id: 'check-1', text: 'Confirm scope', done: false },
    ])
  })

  it('rejects attachment objects without a persisted url and name', () => {
    const result = buildProjectTaskCreateData(
      {
        title: 'Bad task',
        attachments: [{ name: 'missing-url.png' }],
      },
      'project-1',
      'org-1',
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/url and name/)
  })

  it('only emits valid update fields', () => {
    const result = buildProjectTaskUpdateData({
      title: 'Updated',
      labels: ['qa'],
      assigneeIds: ['user-3'],
      estimateMinutes: null,
      ignored: 'nope',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toEqual({
      title: 'Updated',
      labels: ['qa'],
      assigneeIds: ['user-3'],
      assigneeId: 'user-3',
      estimateMinutes: null,
    })
  })

  it('sorts legacy tasks without order after ordered tasks', () => {
    const tasks = [
      { id: 'legacy' },
      { id: 'later', order: 20 },
      { id: 'earlier', order: 10 },
    ].sort((a, b) => taskOrderMillis(a.order) - taskOrderMillis(b.order))

    expect(tasks.map(task => task.id)).toEqual(['earlier', 'later', 'legacy'])
  })
})
