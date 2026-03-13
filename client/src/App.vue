<template>
  <RouterView />
  <AppToast />
</template>

<script setup>
import { RouterView } from 'vue-router'
import AppToast from '@/components/layout/AppToast.vue'
</script>
