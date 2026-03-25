import api from './client.js'

export const runCaseAgent = (caseId) => api.post(
  '/agent/run',
  { caseId },
  { timeout: 120000 },
)

