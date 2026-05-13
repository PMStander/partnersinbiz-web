export type AgentId = 'pip' | 'theo' | 'maya' | 'sage' | 'nora'

export type AgentTaskCard = {
  id: string
  source: 'project' | 'standalone'
  orgId: string
  title: string
  projectId: string | null
  projectName: string | null
  assigneeAgentId: AgentId | null
  agentStatus: string | null
  agentInputSpec: string | null
  agentOutputSummary: string | null
  priority: string | null
  tags: string[]
  updatedAt: string | null
  createdAt: string | null
  href: string
}
