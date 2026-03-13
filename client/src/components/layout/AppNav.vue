<template>
  <nav class="nav">
    <div class="nav-logo serif">法盾</div>
    <span class="nav-user">
      已登录
      <span class="nav-phone">{{ auth.user?.phone }}</span>
    </span>
    <button class="btn btn-g btn-sm" style="margin-left:12px" @click="handleLogout">退出</button>
  </nav>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'
const auth   = useAuthStore()
const router = useRouter()

function handleLogout() {
  auth.logout()
  router.push('/')
}
</script>
