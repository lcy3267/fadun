<template>
  <Teleport to="body">
    <div v-if="modelValue" class="overlay" @click.self="$emit('update:modelValue', false)">
      <div
        class="modal"
        :class="{ 'modal-lg': lg, 'modal--content-fill': contentFill }"
        @click.stop
      >
        <div class="modal-head">
          <div class="modal-title serif">{{ title }}</div>
          <button class="modal-close" @click="$emit('update:modelValue', false)">✕</button>
        </div>
        <div class="modal-body" :class="{ 'modal-body--fill': contentFill }">
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
defineProps({
  modelValue: Boolean,
  title: String,
  lg: Boolean,
  /** 内容区不产生外层滚动条，由 slot 内部自行滚动（如聊天） */
  contentFill: Boolean,
})
defineEmits(['update:modelValue'])
</script>

<style scoped>
.modal--content-fill {
  max-height: min(85vh, 720px);
  display: flex;
  flex-direction: column;
}
.modal-body--fill {
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
