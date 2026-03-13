import api from './client.js'

export const login    = (data) => api.post('/auth/login', data)
export const register = (data) => api.post('/auth/register', data)
export const me       = ()     => api.get('/auth/me')
