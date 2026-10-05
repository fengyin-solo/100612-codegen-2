<template>
  <section class="panel">
    <div class="hazard-head">
      <h3 class="panel-title">巡检隐患清单 · 待整改（冻结与开挖工序）</h3>
      <span class="count-pill" :class="store.pendingHazards.length ? 'pill-bad' : 'pill-ok'">
        待整改 {{ store.pendingHazards.length }} 条 · 已闭环 {{ closedCount }} 条
      </span>
    </div>
    <p class="source-note">
      本清单与「安全巡检」页读取同一份数据；异常进尺自动写入，闭环处理结论两处同步可见。
      各条记录的「未达标孔数」与冻土帷幕判定逐孔对得上。
    </p>

    <table class="data-table compact">
      <thead>
        <tr>
          <th>隐患</th><th>等级</th><th>状态</th><th>未达标孔数</th><th>未达标孔</th>
          <th>登记时间</th><th>处理结论</th><th>闭环操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in store.hazards" :key="item.id">
          <td>
            <strong>{{ item.title }}</strong>
            <p class="detail">{{ item.detail }}</p>
          </td>
          <td>{{ item.hazardLevel }}</td>
          <td :class="item.status === '待整改' ? 'bad-text' : 'ok-text'">{{ item.status }}</td>
          <td>{{ item.unqualifiedCount }}</td>
          <td>{{ item.unqualifiedCodes.length ? item.unqualifiedCodes.join('、') : '无' }}</td>
          <td>{{ item.createdAt.replace('T', ' ') }}</td>
          <td>
            <template v-if="item.conclusion">{{ item.closedAt?.replace('T', ' ') }}：{{ item.conclusion }}</template>
            <template v-else class="muted">待整改</template>
          </td>
          <td>
            <template v-if="item.status === '待整改'">
              <input v-model="drafts[item.id]" placeholder="填写处理结论" @keydown.enter="close(item.id)" />
              <button class="link" type="button" @click="close(item.id)">回写结论并闭环</button>
            </template>
            <template v-else><span class="muted">已闭环</span></template>
          </td>
        </tr>
        <tr v-if="!store.hazards.length">
          <td colspan="8" class="empty-state">暂无隐患：开挖进尺异常登记后会自动进入待整改清单</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<script setup lang="ts">
import { reactive, computed } from 'vue'
import type { GateResult } from '../types'
import { useFreezingStore } from '../store'

const emit = defineEmits<{ (e: 'notice', result: GateResult): void }>()
const notify = (result: GateResult) => emit('notice', result)

const store = useFreezingStore()
const drafts = reactive<Record<number, string>>({})
const closedCount = computed(() => store.hazards.length - store.pendingHazards.length)

function close(id: number) {
  notify(store.closeHazard(id, drafts[id] ?? ''))
  if (drafts[id]) drafts[id] = ''
}
</script>

<style scoped>
.panel { background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 12px; }
.hazard-head { display: flex; justify-content: space-between; align-items: center; }
.panel-title { margin: 0; font-size: 15px; }
.count-pill { border-radius: 999px; padding: 2px 12px; font-size: 12px; }
.pill-bad { background: #fef3f2; color: #b42318; border: 1px solid #f0a9a2; }
.pill-ok { background: #f2fbf4; color: #067647; border: 1px solid #a6d5b0; }
.source-note { font-size: 12px; color: var(--muted); margin: 6px 0 10px; }
.data-table.compact th, .data-table.compact td { padding: 6px 8px; font-size: 12px; vertical-align: top; }
.detail { margin: 2px 0 0; color: var(--muted); font-size: 12px; max-width: 360px; }
td input { width: 150px; padding: 4px 6px; border: 1px solid var(--border); border-radius: 6px; margin-right: 6px; }
.ok-text { color: #067647; }
.bad-text { color: #b42318; }
.muted { color: var(--muted); }
</style>
