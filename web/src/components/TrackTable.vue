<script setup lang="ts">
import type { TrackTable as TrackTableType } from '../types/sound-file'
import type { PaneSide } from '../composables/useCopyPaste'
import TrackRow from './TrackRow.vue'

const props = defineProps<{
  table: TrackTableType
  side: PaneSide
}>()

const emit = defineEmits<{
  overwrite: [tableKind: string, index: number]
  'import-wav': [tableKind: string, index: number, file: File]
}>()

function handleOverwrite(index: number) {
  emit('overwrite', props.table.kind, index)
}

function handleImportWav(index: number, file: File) {
  emit('import-wav', props.table.kind, index, file)
}

// For paired tables, only show the A entries (even indices).
function visibleSlots(): { track: typeof props.table.slots[number]; index: number }[] {
  if (props.table.isPaired) {
    const result = []
    for (let i = 0; i < props.table.slots.length; i += 2) {
      result.push({ track: props.table.slots[i], index: i })
    }
    return result
  }
  return props.table.slots.map((track, index) => ({ track, index }))
}

function usedCount(): number {
  if (props.table.isPaired) {
    let count = 0
    for (let i = 0; i < props.table.slots.length; i += 2) {
      if (props.table.slots[i] !== null) count++
    }
    return count
  }
  return props.table.slots.filter(s => s !== null).length
}
</script>

<template>
  <div class="track-table">
    <div class="table-header">
      <strong>{{ table.label }}</strong>
      <span class="used-count">{{ usedCount() }} / {{ table.isPaired ? table.entryCount / 2 : table.entryCount }} used</span>
    </div>
    <table>
      <thead>
        <tr>
          <th class="col-index">#</th>
          <th class="col-size">Size</th>
          <th class="col-duration">Duration</th>
          <th v-if="table.isPaired" class="col-loop">Loop</th>
          <th class="col-crc">CRC32</th>
          <th class="col-actions"></th>
        </tr>
      </thead>
      <tbody>
        <TrackRow
          v-for="{ track, index } in visibleSlots()"
          :key="index"
          :track="track"
          :index="index"
          :table-kind="table.kind"
          :is-paired="table.isPaired"
          :side="side"
          @overwrite="handleOverwrite"
          @import-wav="handleImportWav"
        />
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.track-table {
  margin-bottom: 16px;
}
.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  background: #e9ecef;
  border: 1px solid #ccc;
  border-bottom: none;
  font-size: 13px;
}
.used-count {
  color: #666;
  font-size: 12px;
}
table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid #ccc;
}
th {
  background: #f8f9fa;
  padding: 4px 8px;
  font-size: 12px;
  text-align: right;
  border-bottom: 1px solid #ccc;
}
th.col-index {
  text-align: right;
  width: 50px;
}
th.col-actions {
  width: 60px;
}
</style>
