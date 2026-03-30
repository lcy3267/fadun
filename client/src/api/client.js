import axios from 'axios'

/** 与 Vite 前端同源时用 `/api`；前后端分域时在 `.env` 中设置 `VITE_API_BASE`（如 `https://api.example.com/api`） */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
  timeout: 60000,
})

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
