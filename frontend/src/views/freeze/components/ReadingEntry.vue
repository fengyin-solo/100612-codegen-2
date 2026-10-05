<template>
  <section class="reading-panel">
    <header class="panel-head">
      <h3>冻结孔测温</h3>
      <span class="panel-tip">按孔登记；同孔同时刻重复只留一条；一批要么全成，要么整批退回不落半条</span>
    </header>

    <!-- 班次覆盖：断掉从那个孔接着补测 -->
    <div class="shift-bar">
      <label class="shift-item">
        <span>班次日期</span>
        <input v-model="shiftDate" type="date" />
      </label>
      <label class="shift-item">
        <span>班次</span>
        <select v-model="shiftSlot">
          <option value="白班">白班 08:00-20:00</option>
          <option value="夜班">夜班 20:00-次日08:00</option>
        </select>
      </label>
      <div class="coverage" :class="readings.length ? 'coverage-ok' : coverage.empty ? 'coverage-empty' : 'coverage-warn'">
        <template v-if="readings.length && coverage.empty">
          本班曾登记空态，现已补到 {{ coverage.measuredHoleIds.length }} 条读数；仍缺
          <strong>{{ coverage.breakpoint?.code }}</strong>，请从该孔用新时刻续测。
        </template>
        <template v-else-if="coverage.empty">
          本班为整班空态：{{ coverage.empty.reason }}
        </template>
        <template v-else-if="coverage.missingHoles.length">
          本班已测 {{ coverage.measuredHoleIds.length }}/{{ holes.length }} 孔，
          测温在 <strong>{{ coverage.breakpoint?.code }}</strong> 断掉，请从该孔用<strong>新时刻</strong>接着补测，禁止照抄旧读数。
        </template>
        <template v-else>本班 {{ holes.length }} 孔全部取到读数。</template>
      </div>
    </div>

    <!-- 整班空态 -->
    <details class="empty-box">
      <summary>一整个班次都没取到读数？登记空态说明（原因必填，不能停在半路）</summary>
      <form class="empty-form" @submit.prevent="submitEmpty">
        <textarea v-model="emptyReason" rows="2" :placeholder="`说明 ${shiftDate} ${shiftSlot} 整班未取数的原因，如夜间断电、采集仪故障……`"></textarea>
        <button class="btn primary" type="submit">登记本班空态</button>
      </form>
    </details>

    <!-- 批量上送表 -->
    <table class="data-table entry-table">
      <thead>
        <tr>
          <th>冻结孔（序号/孔号）</th>
          <th>测温时刻</th>
          <th>实测温度 ℃</th>
          <th>设计 ℃</th>
          <th>该孔最新读数</th>
          <th>断点补测</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, index) in rows" :key="index">
          <td>
            <select v-model.number="row.holeId">
              <option v-for="hole in holes" :key="hole.id" :value="hole.id">
                {{ hole.seqNo }}. {{ hole.code }}（{{ hole.layoutDate }}{{ hole.gap ? '·缺测待补' : '' }}）
              </option>
            </select>
          </td>
          <td><input v-model="row.measuredAt" type="datetime-local" /></td>
          <td><input v-model.number="row.temp" type="number" step="0.1" class="temp-input" /></td>
          <td>{{ designOf(row.holeId) }}℃</td>
          <td>
            <template v-if="latestOf(row.holeId)">
              <span :class="qualifiedOf(row.holeId) ? 'temp-ok' : 'temp-bad'">
                {{ latestOf(row.holeId)?.temp }}℃
                @{{ latestOf(row.holeId)?.measuredAt.replace('T', ' ') }}
              </span>
            </template>
            <span v-else class="muted">无读数{{ holeOf(row.holeId)?.gap ? '（缺测待补）' : '' }}</span>
          </td>
          <td><input v-model="row.resumed" type="checkbox" :checked="row.resumed" /></td>
          <td>
            <button v-if="rows.length > 1" class="link" type="button" @click="removeRow(index)">移除</button>
          </td>
        </tr>
      </tbody>
    </table>

    <div class="entry-actions">
      <button class="btn" type="button" @click="addRow">加一行</button>
      <button class="btn ghost" type="button" @click="prefillBreakpoint">从断点孔 {{ coverage.breakpoint?.code ?? '' }} 补测一行</button>
      <button class="btn primary" type="button" @click="submit">整批上送（{{ rows.length }} 行，同批原子提交）</button>
    </div>

    <h4 class="list-title">测温记录（与“监测入口”取同一份，刷新即同步）</h4>
    <table class="data-table">
      <thead>
        <tr>
          <th>时刻</th>
          <th>班次</th>
          <th>孔号</th>
          <th>实测 ℃</th>
          <th>设计 ℃</th>
          <th>判定</th>
          <th>补测</th>
          <th>测温人</th>
          <th>备注</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="reading in readings" :key="reading.id">
          <td>{{ reading.measuredAt.replace('T', ' ') }}</td>
          <td>{{ reading.shiftDate }} {{ reading.shiftSlot }}</td>
          <td>{{ reading.holeCode }}</td>
          <td>{{ reading.temp }}</td>
          <td>{{ designOf(reading.holeId) }}℃</td>
          <td>
            <span :class="['tag', reading.temp <= designOf(reading.holeId) ? 'tag-ok' : 'tag-danger']">
              {{ reading.temp <= designOf(reading.holeId) ? '达标' : `高 ${(reading.temp - designOf(reading.holeId)).toFixed(1)}℃` }}
            </span>
          </td>
          <td>{{ reading.resumed ? '是' : '—' }}</td>
          <td>{{ reading.operator }}</td>
          <td>{{ reading.note || '—' }}</td>
        </tr>
        <tr v-if="!readings.length">
          <td colspan="9" class="empty-state">本班还没有测温记录</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import {
  declareEmptyShift,
  holeById,
  latestReadings,
  listReadings,
  orderedHoles,
  shiftCoverage,
  submitReadings,
} from '@/data/freeze-service'
import { freezeState } from '@/data/freeze-store'
import type { ReadingInput, ShiftSlot, TempReading } from '@/data/freeze-types'
import { useSessionStore } from '@/stores/session'

const props = withDefaults(defineProps<{
  defaultDate?: string
}>(), { defaultDate: '2026-10-05' })

const emit = defineEmits<{ (event: 'result', message: string, ok: boolean): void }>()

const store = useSessionStore()
const state = freezeState()

const holes = computed(() => orderedHoles(state))
const latestMap = computed(() => latestReadings(state))

const shiftDate = ref(props.defaultDate)
const shiftSlot = ref<ShiftSlot>('白班')

const readings = computed(() =>
  listReadings({ date: shiftDate.value, slot: shiftSlot.value }),
)
const coverage = computed(() => shiftCoverage(state, shiftDate.value, shiftSlot.value))

function designOf(holeId: number): number {
  return holeById(state, holeId)?.designTemp ?? 0
}
function holeOf(holeId: number) {
  return holeById(state, holeId)
}
function latestOf(holeId: number): TempReading | undefined {
  return latestMap.value.get(holeId)
}
function qualifiedOf(holeId: number): boolean {
  const reading = latestMap.value.get(holeId)
  const hole = holeById(state, holeId)
  return Boolean(reading && hole && reading.temp <= hole.designTemp)
}

interface EntryRow extends ReadingInput {
  note: string
}
function defaultTime(date: string, slot: ShiftSlot): string {
  return slot === '白班' ? `${date}T10:00` : `${date}T22:00`
}
function makeRow(): EntryRow {
  const breakpoint = coverage.value.breakpoint
  return {
    holeId: breakpoint?.id ?? holes.value[0]?.id ?? 0,
    measuredAt: defaultTime(shiftDate.value, shiftSlot.value),
    temp: NaN,
    resumed: Boolean(breakpoint),
    note: '',
  }
}
const rows = ref<EntryRow[]>([])
function resetRows() {
  rows.value = [makeRow()]
}
function addRow() {
  const row = makeRow()
  const used = new Set(rows.value.map((r) => r.holeId))
  const next = holes.value.find((h) => !used.has(h.id))
  if (next) row.holeId = next.id
  rows.value.push(row)
}
function removeRow(index: number) {
  rows.value.splice(index, 1)
}
function prefillBreakpoint() {
  const breakpoint = coverage.value.breakpoint
  if (!breakpoint) {
    emit('result', '本班没有断点孔，全部孔已取到读数。', true)
    return
  }
  rows.value.push({
    holeId: breakpoint.id,
    measuredAt: defaultTime(shiftDate.value, shiftSlot.value),
    temp: NaN,
    resumed: true,
    note: '',
  })
}

watch([shiftDate, shiftSlot], resetRows, { immediate: true })

const emptyReason = ref('')
function submitEmpty() {
  const result = declareEmptyShift(shiftDate.value, shiftSlot.value, emptyReason.value, store.operator)
  emit('result', result.message, result.ok)
  if (result.ok) emptyReason.value = ''
}

function submit() {
  const inputs: ReadingInput[] = rows.value.map((row) => ({ ...row, temp: Number(row.temp) }))
  const result = submitReadings(inputs, store.operator)
  emit('result', result.message, result.ok)
  if (result.ok) resetRows()
}
</script>

<style scoped>
.reading-panel {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
  margin: 14px 0;
}
.panel-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 8px;
}
.panel-head h3 {
  margin: 0;
  font-size: 15px;
}
.panel-tip {
  font-size: 12px;
  color: var(--muted);
}
.shift-bar {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.shift-item span {
  display: block;
  font-size: 12px;
  color: var(--muted);
}
.coverage {
  flex: 1;
  min-width: 280px;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 13px;
}
.coverage-ok {
  background: #ecfdf3;
  color: #027a48;
}
.coverage-warn {
  background: #fffaeb;
  color: #b54708;
}
.coverage-empty {
  background: #fef3f2;
  color: #b42318;
}
.empty-box {
  margin-bottom: 10px;
  font-size: 13px;
}
.empty-form {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-top: 8px;
}
.empty-form textarea {
  flex: 1;
  font: inherit;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
}
.entry-table select,
.entry-table input {
  font: inherit;
  padding: 4px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
}
.temp-input {
  width: 90px;
}
.temp-ok {
  color: #027a48;
}
.temp-bad {
  color: #b42318;
}
.entry-actions {
  display: flex;
  gap: 10px;
  margin: 10px 0 14px;
  flex-wrap: wrap;
}
.list-title {
  margin: 6px 0;
  font-size: 14px;
}
.tag {
  display: inline-block;
  border-radius: 999px;
  padding: 1px 10px;
  font-size: 12px;
}
.tag-danger {
  background: #fef3f2;
  color: #b42318;
}
.tag-ok {
  background: #ecfdf3;
  color: #027a48;
}
.muted {
  color: var(--muted);
  font-size: 12px;
}
</style>
