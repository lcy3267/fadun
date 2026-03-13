import axios from 'axios'

const api = axios.create({ baseURL: '/api', timeout: 60000 })

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('fd_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(
  res => res.data,
  err => {
    const msg = err.response?.data?.error || '请求失败，请重试'
    return Promise.reject(new Error(msg))
  }
)

export default api
