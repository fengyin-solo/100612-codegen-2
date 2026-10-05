/**
 * 联络通道冻结法施工 · 冻结与开挖工序台账的领域类型。
 * 这一份数据同时供「联络通道工序台账」与「冻结监测与开挖登记」两个入口读取，
 * 安全巡检页的待整改清单也从这里取数，保证两边条数、未达标孔数对得上。
 */

/** 测温轮次状态：进行中可继续取数；中断后必须从断掉的孔补测；空班须写明整班取不到数的原因。 */
export type RoundStatus = '进行中' | '中断' | '已完成' | '空班'

/** 冻结孔：按布孔日期重排顺序，设计温度是冻土帷幕达标的判定基准。 */
export interface FreezeHole {
  id: number
  /** 孔号，如 D01 */
  code: string
  /** 设计温度（℃），实测温度不高于它才算该孔达标 */
  designTempC: number
  /** 布孔日期 YYYY-MM-DD，存量孔据此重新排序入库 */
  layoutDate: string
  /** 按布孔日期排定的测温顺序（同一天按孔号排） */
  orderSeq: number
  /** 是否存量孔（回填入库） */
  imported: boolean
}

/** 测温记录：同一孔同一时刻只保留第一条，禁止拿旧读数顶替新数据。 */
export interface FreezeReading {
  id: number
  holeId: number
  /** 取数时刻，精确到分钟 YYYY-MM-DDTHH:mm，与孔号组成去重键 */
  at: string
  tempC: number
  /** 取数来源：正常值守测温 / 中断后从断孔接着补测 */
  source: '值守测温' | '中断补测'
  roundId: number | null
  recorder: string
  createdAt: string
}

/** 测温轮次：一个班次一次，覆盖全部在册冻结孔。 */
export interface FreezeRound {
  id: number
  shiftLabel: string
  startedAt: string
  status: RoundStatus
  /** 已测孔的孔号 id，严格按取数顺序记录，中断后据此找断掉的那个孔 */
  measuredHoleIds: number[]
  /** 中断时断掉、需要接着补测的孔；空班/完成时为 null */
  resumeHoleId: number | null
  interruptedAt: string | null
  /** 整班未取到读数时的空态说明（必填原因） */
  emptyReason: string | null
  closedAt: string | null
}

/** 开挖进尺：只有帷幕达标、测温无中断/未完成轮次时才允许登记。 */
export interface AdvanceEntry {
  id: number
  advanceDate: string
  /** 班掘进进尺（m） */
  meter: string
  shiftLabel: string
  recorder: string
  /** 进尺是否异常（超偏、停挖、工作面异常等） */
  abnormal: boolean
  abnormalReason: string
  /** 登记瞬间的帷幕判定快照，事后复核用 */
  curtainSnapshot: CurtainSnapshot
  createdAt: string
}

/** 二次衬砌浇筑：必须在首条开挖进尺之后，顺序不许颠倒。 */
export interface LiningPour {
  id: number
  pourDate: string
  sectionLabel: string
  recorder: string
  createdAt: string
}

/** 巡检隐患：开挖进尺异常自动写入，处理结论闭环后回写，两个入口读同一份。 */
export interface FreezeHazard {
  id: number
  /** 业务去重键，同一条隐患重复递交只记一次 */
  bizKey: string
  title: string
  detail: string
  hazardLevel: '一般' | '较大'
  status: '待整改' | '已闭环'
  /** 产生隐患那一刻的未达标孔数，与台账页面显示的数量一致 */
  unqualifiedCount: number
  unqualifiedCodes: string[]
  sourceAdvanceId: number | null
  createdAt: string
  closedAt: string | null
  /** 处理结论，闭环时必填，回写后巡检与台账两处都能读到 */
  conclusion: string | null
}

export interface LedgerState {
  holes: FreezeHole[]
  readings: FreezeReading[]
  rounds: FreezeRound[]
  advances: AdvanceEntry[]
  linings: LiningPour[]
  hazards: FreezeHazard[]
  seq: number
}

export type UnqualifiedHole = {
  holeId: number
  code: string
  /** warm：温度不够；missing：从没取到过读数（缺温度的存量孔按待补测计） */
  kind: 'warm' | 'missing'
  /** 距设计温度还差多少度（℃），missing 时为 null */
  gapC: number | null
  latestTempC: number | null
  designTempC: number
}

export interface CurtainSnapshot {
  qualified: boolean
  totalHoles: number
  unqualifiedCount: number
  unqualified: UnqualifiedHole[]
  /** 给人看的判定说明，逐条列出差多少度 */
  summary: string
}

export type GateResult = { ok: boolean; message: string }

export type MutationResult = GateResult
