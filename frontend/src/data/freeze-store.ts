import { reactive } from 'vue'

import { buildFreezeSeed } from './freeze-seed'
import type { FreezeState } from './freeze-types'

// 联络通道台账独立存储，与通用模块的 entries 互不影响。
// 三个入口（工序台账、监测入口、安全巡检隐患清单）都挂这同一份 reactive 状态。
const STORAGE_KEY = 'cross-passage-freeze:ledger-v1'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function loadInitial(): FreezeState {
  if (typeof window !== 'undefined' && window.localStorage) {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      try {
        return JSON.parse(raw) as FreezeState
      } catch {
        // 存坏了不硬用，落回播种数据。
      }
    }
  }
  return buildFreezeSeed()
}

const state = reactive<FreezeState>(loadInitial())

function persist(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }
}

/** 规则层通过 commit 在一次同步提交里完成“校验通过 → 写入 → 落盘”。 */
export function commit(mutate: (draft: FreezeState) => void): void {
  mutate(state)
  persist()
}

export function freezeState(): FreezeState {
  return state
}

export function resetFreezeLedger(): FreezeState {
  const fresh = buildFreezeSeed()
  state.holes = clone(fresh.holes)
  state.readings = clone(fresh.readings)
  state.emptyShifts = clone(fresh.emptyShifts)
  state.advances = clone(fresh.advances)
  state.linings = clone(fresh.linings)
  state.hazards = clone(fresh.hazards)
  state.logs = clone(fresh.logs)
  state.seq = clone(fresh.seq)
  state.version = fresh.version
  persist()
  return state
}

export { STORAGE_KEY as FREEZE_STORAGE_KEY }
