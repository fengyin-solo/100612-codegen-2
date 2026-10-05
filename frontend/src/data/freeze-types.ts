/** 联络通道冻结与开挖工序台账的领域类型。
 * 与通用 EntryRow 分开存：这里有明确的工序先后、按孔测温与同源对账要求。 */

export type ShiftSlot = '白班' | '夜班'

/** 冻结孔：按孔登记，设计温度是冻土帷幕达标的判定基准。 */
export interface FreezeHole {
  id: number
  /** 孔号，如 D01 */
  code: string
  /** 入库序号：存量孔按布孔日期重新入库后重排 */
  seqNo: number
  /** 布孔日期 YYYY-MM-DD */
  layoutDate: string
  /** 设计冻结温度（℃），实测须 ≤ 该值才算该孔达标 */
  designTemp: number
  /** 是否存量冻结孔 */
  legacy: boolean
  /** 存量孔是否已按布孔日期重新入库 */
  reindexed: boolean
  /** 回填资料中是否缺温度记录（缺测待补） */
  gap: boolean
  /** 缺温度孔的补齐方式说明 */
  gapNote: string
}

/** 测温记录：同一孔同一时刻只允许一条。 */
export interface TempReading {
  id: number
  holeId: number
  holeCode: string
  /** 实测时刻 YYYY-MM-DDTHH:mm，必须是新时刻，不得拿旧读数顶替 */
  measuredAt: string
  shiftDate: string
  shiftSlot: ShiftSlot
  /** 实测温度（℃） */
  temp: number
  /** 是否为测温中断后从断点孔续测的补测读数 */
  resumed: boolean
  operator: string
  note: string
}

/** 整班空态说明：一个班次一条，原因必填。 */
export interface EmptyShift {
  id: number
  shiftDate: string
  shiftSlot: ShiftSlot
  reason: string
  operator: string
  createdAt: string
}

/** 开挖进尺：只有冻土帷幕达标才准登记。 */
export interface AdvanceRecord {
  id: number
  /** 桩号/部位 */
  mileage: string
  /** 本班进尺（m） */
  advance: number
  startedAt: string
  abnormal: boolean
  abnormalNote: string
  operator: string
}

/** 二衬浇筑：不得先于开挖进尺登记。 */
export interface LiningRecord {
  id: number
  mileage: string
  /** 浇筑方量（m³） */
  volume: number
  pouredAt: string
  operator: string
  note: string
}

export type HazardSource = '未达标强行开挖' | '开挖进尺异常' | '存量孔缺温度' | '测温空班'

/** 隐患：工序台账、监测第二入口、安全巡检三处读写同一份。 */
export interface HazardRecord {
  id: number
  code: string
  source: HazardSource
  level: string
  content: string
  /** 登记时刻的未达标孔数快照：台账与巡检两处读到的数必须对得上 */
  unqualifiedCount: number
  status: '待整改' | '已闭环'
  createdAt: string
  /** 处理结论（闭环时回写） */
  closureNote: string
  closedAt: string
}

export type LogKind = '成功' | '退回' | '提示'

/** 操作留痕：每次递交只记一条；写不成不留半条业务数据。 */
export interface OpLog {
  id: number
  at: string
  kind: LogKind
  action: string
  detail: string
  operator: string
}

export interface FreezeState {
  version: number
  holes: FreezeHole[]
  readings: TempReading[]
  emptyShifts: EmptyShift[]
  advances: AdvanceRecord[]
  linings: LiningRecord[]
  hazards: HazardRecord[]
  logs: OpLog[]
  seq: Record<string, number>
}

/** 批量测温上送的一行输入 */
export interface ReadingInput {
  holeId: number
  measuredAt: string
  temp: number
  resumed: boolean
  note?: string
}

export interface ServiceResult {
  ok: boolean
  message: string
  inserted?: number
  merged?: number
}
