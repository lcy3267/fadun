import api from './client.js'

export const getLatestCaseChat = (caseId) =>
  api.get(`/agent/chat/latest?caseId=${encodeURIComponent(caseId)}`, { timeout: 30000 })

export const sendCaseChatMessage = ({ caseId, message, sessionId }) => {
  return api.post(
    '/agent/chat/send',
    { caseId, message, sessionId },
    { timeout: 120000 },
  )
}

