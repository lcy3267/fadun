import api from './client.js'

export const getCases    = ()         => api.get('/cases')
export const getCase     = (id)       => api.get(`/cases/${id}`)
export const createCase  = (data)     => api.post('/cases', data)
export const updateCase  = (id, data) => api.put(`/cases/${id}`, data)
export const deleteCase  = (id)       => api.delete(`/cases/${id}`)
export const aiInit      = (data)     => api.post('/ai/init', data, { timeout: 120000 })
export const aiDocument  = (caseId)   => api.post('/ai/document', { caseId })
