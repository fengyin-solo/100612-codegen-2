/* 纯规则层冒烟脚本：node scripts/smoke-freezing.mjs，不依赖浏览器与构建。 */
import {
  buildSeedState,
} from '../src/features/freezing/seed.ts'
import {
  evaluateCurtain,
  checkAdvanceGate,
  checkLiningGate,
  deriveStage,
  sortHolesByLayout,
} from '../src/features/freezing/rules.ts'

let failures = 0
function assert(name, cond, detail = '') {
  if (cond) {
    console.log(`  ✔ ${name}`)
  } else {
    failures += 1
    console.error(`  ✘ ${name} ${detail}`)
  }
}

console.log('1) 存量孔按布孔日期重排')
const s0 = buildSeedState()
const codes = sortHolesByLayout(s0.holes).map((h) => h.code)
assert('顺序为 D02(09-20) 在最前', codes[0] === 'D02', codes.join(','))
assert('同日 D01 先于 D03', codes.indexOf('D01') < codes.indexOf('D03'))

console.log('2) 帷幕判定：缺读数 + 温度不够')
const c0 = evaluateCurtain(s0.holes, s0.readings)
assert('初始帷幕不达标', c0.qualified === false)
assert('未达标 3 孔（D03 暖、D05 缺、D06 暖）', c0.unqualifiedCount === 3, String(c0.unqualifiedCount))
const d03 = c0.unqualified.find((u) => u.code === 'D03')
const d05 = c0.unqualified.find((u) => u.code === 'D05')
assert('D03 还差 3.5℃', d03 && d03.kind === 'warm' && d03.gapC === 3.5, JSON.stringify(d03))
assert('D05 按缺读数处理', d05 && d05.kind === 'missing')
assert('说明里带差距描述', c0.summary.includes('还差 3.5℃'))

console.log('3) 测温中断时开挖被挡，且指出断掉的孔')
let gate = checkAdvanceGate({
  holes: s0.holes,
  readings: s0.readings,
  rounds: s0.rounds,
  advances: [],
  linings: [],
})
assert('中断轮次挡回开挖', gate.ok === false)
assert('提示从 D05 补测', gate.message.includes('D05'), gate.message)
assert('提示不能拿旧读数顶替', gate.message.includes('旧读数'))

console.log('4) 补测收齐 + 降温达标后才放行')
// 恢复轮次：D05~D08 全部补测，且 D03 降温到 -10.5
const repaired = JSON.parse(JSON.stringify(s0))
repaired.rounds[0].status = '已完成'
repaired.rounds[0].resumeHoleId = null
repaired.rounds[0].closedAt = '2026-10-05T11:00'
repaired.rounds[0].measuredHoleIds = [1, 2, 3, 4, 5, 6, 7, 8]
repaired.readings.push(
  { id: 201, holeId: 3, at: '2026-10-05T10:30', tempC: -10.5, source: '值守测温', roundId: 1, recorder: '张德福', createdAt: 'x' },
  { id: 202, holeId: 5, at: '2026-10-05T10:35', tempC: -11.0, source: '中断补测', roundId: 1, recorder: '张德福', createdAt: 'x' },
  { id: 203, holeId: 6, at: '2026-10-05T10:40', tempC: -10.2, source: '中断补测', roundId: 1, recorder: '张德福', createdAt: 'x' },
)
const c1 = evaluateCurtain(repaired.holes, repaired.readings)
assert('补测后帷幕达标', c1.qualified === true, c1.summary)
gate = checkAdvanceGate({
  holes: repaired.holes,
  readings: repaired.readings,
  rounds: repaired.rounds,
  advances: [],
  linings: [],
})
assert('达标后开挖放行', gate.ok === true, gate.message)

console.log('5) 无进尺先登记二衬 → 挡回并指出所缺步骤')
const lg0 = checkLiningGate({ advances: [], linings: [] })
assert('无进尺挡回二衬', lg0.ok === false)
assert('指出先测温/进尺步骤', lg0.message.includes('开挖进尺') && lg0.message.includes('还差'))

console.log('6) 已有二衬再补进尺 → 越序挡回')
const gateLate = checkAdvanceGate({
  holes: repaired.holes,
  readings: repaired.readings,
  rounds: repaired.rounds,
  advances: [{ id: 1 }],
  linings: [{ id: 1, pourDate: '2026-10-06', sectionLabel: '首仓', recorder: 'x', createdAt: 'x' }],
})
assert('浇筑后补进尺挡回', gateLate.ok === false && gateLate.message.includes('越序'))

console.log('7) 整班空数（空班轮次已收尾）不再挡开挖；缺孔仍按判定挡')
const emptyRound = JSON.parse(JSON.stringify(repaired))
emptyRound.rounds[0].status = '空班'
emptyRound.rounds[0].emptyReason = '采集仪故障，整夜无法读数'
// 空班的同时把 D05/D06 的读数撤掉，模拟整班没数 → 帷幕缺孔，仍应挡
const withdrawn = JSON.parse(JSON.stringify(emptyRound))
withdrawn.readings = withdrawn.readings.filter((r) => ![5, 6].includes(r.holeId))
withdrawn.rounds[0].status = '空班'
withdrawn.rounds[0].measuredHoleIds = []
const gEmpty = checkAdvanceGate({
  holes: withdrawn.holes,
  readings: withdrawn.readings,
  rounds: withdrawn.rounds,
  advances: [],
  linings: [],
})
assert('空班已收班但孔缺读数 → 仍挡开挖并点名缺孔', !gEmpty.ok && gEmpty.message.includes('D05'), gEmpty.message)

console.log('8) 阶段流转')
assert('初始阶段=测温中', deriveStage({ holes: s0.holes, readings: s0.readings, rounds: s0.rounds, advances: [], linings: [] }).key === 'measuring')
assert('达标未挖=ready', deriveStage({ holes: repaired.holes, readings: repaired.readings, rounds: repaired.rounds, advances: [], linings: [] }).key === 'ready')
assert('有进尺=excavation', deriveStage({ holes: repaired.holes, readings: repaired.readings, rounds: repaired.rounds, advances: [{}], linings: [] }).key === 'excavation')
assert('有二衬=lining', deriveStage({ holes: repaired.holes, readings: repaired.readings, rounds: repaired.rounds, advances: [{}], linings: [{}] }).key === 'lining')

console.log(failures === 0 ? '\n全部规则断言通过' : `\n${failures} 条断言失败`)
process.exit(failures === 0 ? 0 : 1)
