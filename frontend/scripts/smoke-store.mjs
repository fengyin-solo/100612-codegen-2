/* 仓库动作层冒烟：node 通过 esbuild 打包后运行，mock localStorage/window。 */
import { createPinia, setActivePinia } from 'pinia'
import { useFreezingStore } from '../src/features/freezing/store.ts'

let failures = 0
function assert(name, cond, detail = '') {
  if (cond) console.log(`  ✔ ${name}`)
  else {
    failures += 1
    console.error(`  ✘ ${name} ${detail}`)
  }
}

function memoryStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  }
}
globalThis.window = {
  localStorage: memoryStorage(),
  addEventListener: () => {},
  dispatchEvent: () => true,
  CustomEvent: class {},
}
globalThis.localStorage = globalThis.window.localStorage

function store() {
  setActivePinia(createPinia())
  return useFreezingStore()
}

console.log('A) 同孔同刻重复测温只留一条')
{
  const s = store()
  // 先把中断轮次收尾，走自由补录路径
  const r1 = s.addReading({ holeId: 5, at: '2026-10-05T10:35', tempC: -11, recorder: '张' })
  assert('中断后首条必须从 D05 补测，成功并恢复轮次', r1.ok, r1.message)
  const skip = s.addReading({ holeId: 7, at: '2026-10-05T10:36', tempC: -11, recorder: '张' })
  assert('恢复后跳孔（不按序）被挡', !skip.ok && skip.message.includes('顺序'), skip.message)
  const d06 = s.addReading({ holeId: 6, at: '2026-10-05T10:36', tempC: -10.2, recorder: '张' })
  assert('按序补 D06 成功', d06.ok, d06.message)
  const dup = s.addReading({ holeId: 5, at: '2026-10-05T10:35', tempC: -12, recorder: '李' })
  assert('同孔同刻重复上传被挡，只留一条', !dup.ok && dup.message.includes('重复'))
  const count = s.state.readings.filter((x) => x.holeId === 5 && x.at === '2026-10-05T10:35').length
  assert('库里该孔该时刻仍只有 1 条', count === 1, String(count))
}

console.log('B) 旧读数不顶替：历史 -8.0 保留，判定取最新 -10.6')
{
  const s = store()
  const d01All = s.state.readings.filter((x) => x.holeId === 1)
  assert('D01 历史两条读数都在', d01All.length === 2, String(d01All.length))
  const q = s.curtain
  const d01 = s.state.holes.find((h) => h.code === 'D01')
  const latest = d01All.sort((a, b) => (a.at < b.at ? 1 : -1))[0]
  assert('最新一条是 10-05 的 -10.6', latest.tempC === -10.6)
  assert('D01 判定达标', !q.unqualified.some((u) => u.holeId === d01.id))
}

console.log('C) 整班空数：空原因不收；有原因空班收班不挂半路')
{
  const s = store()
  s.resetLedger()
  // 新开一轮（初始存量中断轮次先置为已完成收尾，再开全新零读数轮次）
  let r = s.closeEmptyRound(1, '   ')
  assert('空原因被拒', !r.ok && r.message.includes('原因'))
  r = s.closeEmptyRound(1, '采集仪故障')
  assert('已有读数的轮次不能按空班收', !r.ok && r.message.includes('不属于整班空态'))
  s.state.rounds[0].status = '已完成'
  s.state.rounds[0].closedAt = 'x'
  const started = s.startRound('测试夜班')
  assert('有未收尾轮次时不能再开', started.ok && !s.startRound('测试夜班2').ok)
  const newId = s.state.rounds.at(-1).id
  r = s.closeEmptyRound(newId, '采集仪故障整班无读数')
  assert('零读数轮次可空班收班', r.ok, r.message)
  const round = s.state.rounds.find((x) => x.id === newId)
  assert('状态为空班且记录原因、已收尾', round.status === '空班' && round.emptyReason && round.closedAt)
}

console.log('D) 未达标强挖退回且说明差多少度')
{
  const s = store()
  // 初始中断轮次先挡；模拟轮次被中断但孔温不够的场景：收完班后强挖
  s.state.rounds.forEach((rd) => {
    rd.status = '已完成'
    rd.closedAt = 'x'
  })
  const r = s.addAdvance({ advanceDate: '2026-10-05', meter: '1.0', shiftLabel: '白班', recorder: '王', abnormal: false, abnormalReason: '' })
  assert('未达标强挖被退回', !r.ok)
  assert('退回说明带孔号和差距', r.message.includes('D03') && r.message.includes('3.5℃'), r.message)
  assert('未产生任何进尺', s.state.advances.length === 0)
  assert('未产生隐患', s.state.hazards.length === 0)
}

console.log('E) 达标后异常进尺：进尺落库 + 隐患同事务写入，孔数与帷幕对得上')
{
  const s = store()
  // 补到全部达标并收尾轮次
  s.state.rounds[0].status = '已完成'
  s.state.rounds[0].closedAt = '2026-10-05T11:00'
  s.addReading({ holeId: 5, at: '2026-10-05T10:35', tempC: -11, recorder: '张' })
  s.addReading({ holeId: 6, at: '2026-10-05T10:36', tempC: -10.2, recorder: '张' })
  s.addReading({ holeId: 7, at: '2026-10-05T10:37', tempC: -11.6, recorder: '张' })
  s.addReading({ holeId: 8, at: '2026-10-05T10:38', tempC: -11, recorder: '张' })
  s.addReading({ holeId: 3, at: '2026-10-05T10:39', tempC: -10.5, recorder: '张' })
  // 此时 0 未达标
  assert('帷幕达标', s.curtain.qualified)
  const r = s.addAdvance({ advanceDate: '2026-10-05', meter: '0.9', shiftLabel: '白班', recorder: '王', abnormal: true, abnormalReason: '工作面局部掉块' })
  assert('异常进尺登记成功', r.ok, r.message)
  assert('进尺 1 条', s.state.advances.length === 1)
  assert('隐患 1 条待整改', s.pendingHazards.length === 1)
  assert('隐患未达标孔数=0（与登记时帷幕一致）', s.state.hazards[0].unqualifiedCount === 0)
  const dup = s.addAdvance({ advanceDate: '2026-10-05', meter: '0.9', shiftLabel: '白班', recorder: '王', abnormal: false, abnormalReason: '' })
  assert('同一进尺重复递交只记一次', !dup.ok && s.state.advances.length === 1)
  const closed = s.closeHazard(s.state.hazards[0].id, '挂网补喷后复查合格')
  assert('结论回写闭环成功', closed.ok)
  assert('待整改清零', s.pendingHazards.length === 0)
  assert('结论可查', s.state.hazards[0].conclusion === '挂网补喷后复查合格')
  assert('空结论不能闭环', !s.closeHazard(999, '').ok)
}

console.log('F) 进尺之后才能二衬；首仓后封闭')
{
  const s = store()
  s.resetLedger()
  s.state.rounds[0].status = '已完成'
  s.state.rounds[0].closedAt = 'x'
  // 全部补达标
  const before = s.addLining({ pourDate: '2026-10-05', sectionLabel: '首仓', recorder: '王' })
  assert('无进尺先二衬被挡', !before.ok && before.message.includes('越序'))
  for (const [holeId, temp, at] of [
    [5, -11, '10:35'], [6, -10.2, '10:36'], [7, -11.6, '10:37'], [8, -11, '10:38'], [3, -10.5, '10:39'],
  ]) {
    s.addReading({ holeId, at: `2026-10-05T${at}`, tempC: temp, recorder: '张' })
  }
  assert('全部达标', s.curtain.qualified)
  const adv = s.addAdvance({ advanceDate: '2026-10-05', meter: '1.1', shiftLabel: '白班', recorder: '王', abnormal: false, abnormalReason: '' })
  assert('首条进尺成功', adv.ok, adv.message)
  const lining = s.addLining({ pourDate: '2026-10-06', sectionLabel: '首仓', recorder: '王' })
  assert('二衬成功', lining.ok, lining.message)
  const more = s.addAdvance({ advanceDate: '2026-10-06', meter: '0.5', shiftLabel: '夜班', recorder: '王', abnormal: false, abnormalReason: '' })
  assert('浇筑后进尺被挡', !more.ok)
  const dupLining = s.addLining({ pourDate: '2026-10-06', sectionLabel: '首仓', recorder: '王' })
  assert('二衬重复登记被挡', !dupLining.ok)
}

console.log('G) 存量回填幂等 + 新孔重排')
{
  const s = store()
  s.resetLedger()
  const n0 = s.state.holes.length
  const r1 = s.reimportStock()
  assert('重复回填不新增孔', s.state.holes.length === n0, r1.message)
  const add = s.addHole({ code: 'D09', designTempC: -10, layoutDate: '2026-09-21' })
  assert('新孔登记成功', add.ok, add.message)
  const sorted = s.holes
  const idxD09 = sorted.findIndex((h) => h.code === 'D09')
  const idxD02 = sorted.findIndex((h) => h.code === 'D02')
  assert('09-21 的 D09 排在 09-20 的 D02 之后', idxD02 === 0 && idxD09 === 1, `${idxD02},${idxD09}`)
  assert('新孔无读数 → 未达标待补测', s.curtain.unqualified.some((u) => u.code === 'D09' && u.kind === 'missing'))
  assert('孔号重复被拒', !s.addHole({ code: 'D09', designTempC: -10, layoutDate: '2026-09-21' }).ok)
}

console.log('H) 同源：两个 store 实例经 localStorage 读到同一份')
{
  const storage = memoryStorage()
  globalThis.window.localStorage = storage
  globalThis.localStorage = storage
  const s1 = store()
  s1.resetLedger()
  s1.state.rounds[0].status = '已完成'
  s1.state.rounds[0].closedAt = 'x'
  for (const [holeId, temp, at] of [
    [5, -11, '10:35'], [6, -10.2, '10:36'], [7, -11.6, '10:37'], [8, -11, '10:38'], [3, -10.5, '10:39'],
  ]) {
    s1.addReading({ holeId, at: `2026-10-05T${at}`, tempC: temp, recorder: '张' })
  }
  s1.addAdvance({ advanceDate: '2026-10-05', meter: '0.8', shiftLabel: '白班', recorder: '王', abnormal: true, abnormalReason: '停挖2小时' })
  const s2 = store()
  // 模拟另一个入口从同一份 localStorage 重新装载
  const raw = JSON.parse(storage.getItem('crosspassage-freezing:ledger:v1'))
  s2.state = raw
  assert('第二入口进尺条数一致', s2.state.advances.length === 1)
  assert('第二入口隐患条数一致（1 条待整改）', s2.hazards.filter((h) => h.status === '待整改').length === 1)
  const curtain2 = s2.curtain
  assert('第二入口未达标孔数与隐患快照口径一致（均 0）',
    curtain2.unqualifiedCount === 0 && s2.hazards[0].unqualifiedCount === 0)
}

console.log(failures === 0 ? '\n全部仓库动作断言通过' : `\n${failures} 条断言失败`)
process.exit(failures === 0 ? 0 : 1)
