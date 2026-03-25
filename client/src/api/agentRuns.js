import api from './client.js'

export const listAgentRuns = (caseId) =>
  api.get(`/agent/runs?caseId=${encodeURIComponent(caseId)}`, { timeout: 30000 })

export const getAgentRun = (runId) =>
  api.get(`/agent/runs/${encodeURIComponent(runId)}`, { timeout: 30000 })

