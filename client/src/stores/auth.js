import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as authApi from '@/api/auth.js'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('fd_token') || '')
  const user  = ref(JSON.parse(localStorage.getItem('fd_user') || 'null'))

  const isLoggedIn = computed(() => !!token.value)

  function setAuth(t, u) {
    token.value = t
    user.value  = u
    localStorage.setItem('fd_token', t)
    localStorage.setItem('fd_user', JSON.stringify(u))
  }

  async function login(phone, password) {
    const res = await authApi.login({ phone, password })
    setAuth(res.token, res.user)
    return res
  }

  async function register(phone, password, confirmPassword) {
    const res = await authApi.register({ phone, password, confirmPassword })
    setAuth(res.token, res.user)
    return res
  }

  function logout() {
    token.value = ''
    user.value  = null
    localStorage.removeItem('fd_token')
    localStorage.removeItem('fd_user')
  }

  return { token, user, isLoggedIn, login, register, logout }
})
