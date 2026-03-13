<template>
  <Teleport to="body">
    <div v-if="modelValue" class="overlay" @click.self="$emit('update:modelValue', false)">
      <div class="modal" :class="lg ? 'modal-lg' : ''" @click.stop>
        <div class="modal-head">
          <div class="modal-title serif">{{ title }}</div>
          <button class="modal-close" @click="$emit('update:modelValue', false)">✕</button>
        </div>
        <div class="modal-body">
          <slot />
        </div>
        <div v-if="$slots.footer" class="modal-foot">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
defineProps({ modelValue: Boolean, title: String, lg: Boolean })
defineEmits(['update:modelValue'])
</script>
