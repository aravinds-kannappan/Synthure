export type AgentStatus = 'idle' | 'active' | 'done' | 'failed' | 'skipped'

// Failure never promotes an unfinished stage to completed.
export function stopPipeline(status: Record<string, AgentStatus>): Record<string, AgentStatus> {
  return Object.fromEntries(Object.entries(status).map(([id, value]) => [
    id, value === 'done' ? 'done' : value === 'active' ? 'failed' : 'skipped',
  ]))
}
