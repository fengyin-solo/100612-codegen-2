<template>
  <section class="hazard-panel">
    <header class="panel-head">
      <h3>安全巡检 · 待整改清单（与工序台账同一份）</h3>
      <span class="panel-tip">隐患编号以 LDD 开头，工序台账、监测入口、本页读写同一份数据</span>
    </header>

    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">待整改隐患（两处入口同条数）</span>
        <strong class="stat-value" :class="{ warn: pendingHazards.length > 0 }">{{ pendingHazards.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">已闭环隐患</span>
        <strong class="stat-value">{{ closedHazards.length }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">待整改清单登记的未达标孔合计</span>
        <strong class="stat-value" :class="{ warn: pendingUnqTotal > 0 }">{{ pendingUnqTotal }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">台账当前判定未达标孔数</span>
        <strong class="stat-value" :class="{ warn: verdict.unqualified.length > 0 }">{{ verdict.unqualified.length }}</strong>
      </article>
    </div>

    <p class="reconcile ok">
      对账：两处入口（工序台账/安全巡检）隐患总条数均为 <strong>{{ hazards.length }}</strong> 条（同一份数据，不会一边多一边少）；
      未达标孔数在登记当时由同一判定写入清单——
      <template v-if="pendingHazards.length">
        待整改快照 {{ pendingHazards.map((h) => `${h.code.replace('LDD-', '')}→${h.unqualifiedCount}孔`).join('、') }}，
        台账当前 <strong>{{ verdict.unqualified.length }}</strong> 孔{{ verdict.unqualified.length ? `（${verdict.unqualified.map((v) => v.hole.code).join('、')}）` : '' }}；
        补测后当前值会变、登记快照不改写，登记当时两边必然相等。
      </template>
      <template v-else>无待整改项；台账当前未达标 {{ verdict.unqualified.length }} 孔。</template>
    </p>

    <table class="data-table">
      <thead>
        <tr>
          <th>隐患编号</th>
          <th>来源</th>
          <th>等级</th>
          <th>内容</th>
          <th>登记时未达标孔数</th>
          <th>登记时间</th>
          <th>状态/处理结论</th>
          <th v-if="closable">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="hazard in hazards" :key="hazard.id">
          <td>{{ hazard.code }}</td>
          <td>{{ hazard.source }}</td>
          <td>{{ hazard.level }}</td>
          <td class="content-cell">{{ hazard.content }}</td>
          <td>{{ hazard.unqualifiedCount }}</td>
          <td>{{ hazard.createdAt.replace('T', ' ') }}</td>
          <td>
            <span :class="['tag', hazard.status === '待整改' ? 'tag-danger' : 'tag-ok']">{{ hazard.status }}</span>
            <p v-if="hazard.closureNote" class="closure-note">结论：{{ hazard.closureNote }}<br />（{{ hazard.closedAt.replace('T', ' ') }}）</p>
          </td>
          <td v-if="closable">
            <template v-if="hazard.status === '待整改'">
              <button class="btn" type="button" @click="openClose(hazard.id)">回写结论并闭环</button>
            </template>
            <span v-else class="muted">已销项</span>
          </td>
        </tr>
        <tr v-if="!hazards.length">
          <td :colspan="closable ? 8 : 7" class="empty-state">暂无隐患记录</td>
        </tr>
      </tbody>
    </table>

    <form v-if="closingId !== null" class="close-bar" @submit.prevent="confirmClose">
      <label class="close-field">
        <span>处理结论（必填，回写后两处入口同步可见）</span>
        <textarea v-model="note" rows="2" placeholder="写明处置措施、复测结果与销项依据"></textarea>
      </label>
      <button class="btn primary" type="submit">确认闭环</button>
      <button class="btn ghost" type="button" @click="cancelClose">取消</button>
    </form>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import { closeHazard } from '@/data/freeze-service'
import { freezeState } from '@/data/freeze-store'
import type { CurtainVerdict } from '@/data/freeze-service'
import type { HazardRecord } from '@/data/freeze-types'
import { useSessionStore } from '@/stores/session'

const props = withDefaults(defineProps<{
  verdict: CurtainVerdict
  closable?: boolean
}>(), { closable: true })

const store = useSessionStore()
const state = freezeState()

const hazards = computed<HazardRecord[]>(() =>
  [...state.hazards].sort((a, b) => (a.status === b.status ? b.createdAt.localeCompare(a.createdAt) : a.status === '待整改' ? -1 : 1)),
)
const pendingHazards = computed(() => hazards.value.filter((h) => h.status === '待整改'))
const closedHazards = computed(() => hazards.value.filter((h) => h.status === '已闭环'))
const pendingUnqTotal = computed(() => pendingHazards.value.reduce((sum, h) => sum + h.unqualifiedCount, 0))

const emit = defineEmits<{ (event: 'result', message: string, ok: boolean): void }>()

const closingId = ref<number | null>(null)
const note = ref('')

function openClose(id: number) {
  closingId.value = id
  note.value = ''
}
function cancelClose() {
  closingId.value = null
  note.value = ''
}
function confirmClose() {
  if (closingId.value === null) return
  const result = closeHazard(closingId.value, note.value, store.operator)
  emit('result', result.message, result.ok)
  if (result.ok) cancelClose()
}
</script>

<style scoped>
.hazard-panel {
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
.stat-value.warn {
  color: #b42318;
}
.reconcile {
  margin: 4px 0 10px;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 6px;
}
.reconcile.ok {
  background: #ecfdf3;
  color: #027a48;
}
.reconcile.warn {
  background: #fef3f2;
  color: #b42318;
}
.content-cell {
  max-width: 320px;
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
.closure-note {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--muted);
  max-width: 280px;
}
.close-bar {
  display: flex;
  align-items: flex-end;
  gap: 10px;
  margin-top: 10px;
  padding: 10px;
  background: #f8fafc;
  border-radius: 6px;
}
.close-field {
  flex: 1;
}
.close-field span {
  display: block;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 4px;
}
.close-field textarea {
  width: 100%;
  font: inherit;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
}
.muted {
  color: var(--muted);
  font-size: 12px;
}
</style>
