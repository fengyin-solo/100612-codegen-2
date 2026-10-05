<template>
  <div class="curtain-panel">
    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">当前工序阶段</span>
        <strong class="stat-value stage-value">{{ stage.label }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">在册冻结孔</span>
        <strong class="stat-value">{{ store.holes.length }} 孔</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">未达标孔（含缺读数）</span>
        <strong class="stat-value" :class="curtain.qualified ? 'ok-text' : 'bad-text'">
          {{ curtain.unqualifiedCount }} 孔
        </strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">待整改隐患（巡检同步）</span>
        <strong class="stat-value" :class="store.pendingHazards.length ? 'bad-text' : 'ok-text'">
          {{ store.pendingHazards.length }} 条
        </strong>
      </article>
    </div>

    <ol class="stage-track">
      <li
        v-for="step in steps"
        :key="step.key"
        class="stage-step"
        :class="{ done: stepIndex >= step.index, active: stage.key === step.key }"
      >
        <span class="stage-no">{{ step.index }}</span>
        <span class="stage-name">{{ step.name }}</span>
      </li>
    </ol>

    <div class="curtain-verdict" :class="curtain.qualified ? 'verdict-ok' : 'verdict-bad'">
      <strong>冻土帷幕判定：{{ curtain.qualified ? '已形成，具备开挖条件' : '未形成，禁止开挖' }}</strong>
      <p>{{ curtain.summary }}</p>
      <ul v-if="curtain.unqualified.length" class="gap-list">
        <li v-for="item in curtain.unqualified" :key="item.holeId">
          <template v-if="item.kind === 'missing'">
            {{ item.code }}：尚无任何测温读数（设计 {{ item.designTempC }}℃），按待补测处理
          </template>
          <template v-else>
            {{ item.code }}：实测 {{ item.latestTempC }}℃，设计 {{ item.designTempC }}℃，<em>还差 {{ item.gapC }}℃</em>
          </template>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

import { deriveStage } from '../rules'
import { useFreezingStore } from '../store'

const store = useFreezingStore()

const steps = [
  { key: 'holes', index: 1, name: '冻结孔布孔' },
  { key: 'measuring', index: 2, name: '冻结测温' },
  { key: 'ready', index: 3, name: '帷幕达标确认' },
  { key: 'excavation', index: 4, name: '通道开挖' },
  { key: 'lining', index: 5, name: '二衬浇筑' },
]

const stageIndexMap: Record<string, number> = {
  none: 0,
  holes: 1,
  freezing: 2,
  measuring: 2,
  ready: 3,
  excavation: 4,
  lining: 5,
}

const stage = computed(() =>
  deriveStage({
    holes: store.holes,
    readings: store.state.readings,
    rounds: store.state.rounds,
    advances: store.state.advances,
    linings: store.state.linings,
  }),
)
const stepIndex = computed(() => stageIndexMap[stage.value.key] ?? 0)
const curtain = computed(() => store.curtain)
</script>

<style scoped>
.stage-value { font-size: 15px; }
.ok-text { color: #067647; }
.bad-text { color: #b42318; }
.stage-track { display: flex; gap: 8px; list-style: none; margin: 4px 0 12px; padding: 0; }
.stage-step {
  flex: 1; display: flex; align-items: center; gap: 8px;
  border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px;
  background: #fff; font-size: 12px; color: var(--muted);
}
.stage-no {
  width: 20px; height: 20px; border-radius: 50%; flex: none;
  display: inline-flex; align-items: center; justify-content: center;
  background: #e2e8f0; color: #475569; font-size: 12px;
}
.stage-step.done { border-color: #a6d5b0; background: #f2fbf4; color: #067647; }
.stage-step.done .stage-no { background: #12b76a; color: #fff; }
.stage-step.active { border-color: var(--brand); box-shadow: 0 0 0 2px rgba(31, 111, 235, 0.15); color: #1f2937; }
.curtain-verdict { border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; font-size: 13px; }
.curtain-verdict p { margin: 6px 0 0; }
.verdict-ok { background: #f2fbf4; border: 1px solid #a6d5b0; color: #067647; }
.verdict-bad { background: #fef3f2; border: 1px solid #f0a9a2; color: #b42318; }
.gap-list { margin: 8px 0 0; padding-left: 18px; }
.gap-list em { font-style: normal; font-weight: 700; }
</style>
