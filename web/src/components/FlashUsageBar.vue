<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  used: number
  total: number
}>()

const pct = computed(() => {
  if (props.total === 0) return 0
  return Math.min(100, (props.used / props.total) * 100)
})

const free = computed(() => Math.max(0, props.total - props.used))

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}
</script>

<template>
  <div class="flash-bar">
    <div class="bar-track">
      <div
        class="bar-fill"
        :style="{ width: pct + '%' }"
        :class="{ warning: pct > 90, danger: pct > 98 }"
      ></div>
    </div>
    <div class="bar-label">
      {{ formatBytes(used) }} / {{ formatBytes(total) }}
      ({{ formatBytes(free) }} free)
    </div>
  </div>
</template>

<style scoped>
.flash-bar {
  margin: 8px 0;
}
.bar-track {
  height: 12px;
  background: #e9ecef;
  border-radius: 3px;
  overflow: hidden;
  border: 1px solid #ccc;
}
.bar-fill {
  height: 100%;
  background: #4dabf7;
  transition: width 0.3s;
}
.bar-fill.warning {
  background: #ffa94d;
}
.bar-fill.danger {
  background: #ff6b6b;
}
.bar-label {
  font-size: 11px;
  color: #666;
  margin-top: 2px;
}
</style>
