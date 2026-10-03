/**
 * 账本金额与汇总的单元测试（纯函数）：
 *   node test/ledger.test.mjs
 */
import { parseAmountToCents, monthOf, summarize, formatCents } from '../lib/index.js'

let failed = 0
function check(name, actual, expected) {
  const show = (v) => (typeof v === 'string' ? v : JSON.stringify(v))
  const ok = show(actual) === show(expected)
  if (!ok) failed += 1
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `\n    期望 ${show(expected)}\n    实际 ${show(actual)}`}`)
}

// 金额：一律转成"分"，避免浮点累加误差
check('整数', parseAmountToCents('12'), 1200)
check('一位小数', parseAmountToCents('12.5'), 1250)
check('两位小数', parseAmountToCents('0.01'), 1)
check('带人民币符号', parseAmountToCents('￥12.50'), 1250)
check('带"元"', parseAmountToCents('12.5元'), 1250)
check('带千分位', parseAmountToCents('1,234.5'), 123450)
check('数字输入', parseAmountToCents(12.5), 1250)
check('三位小数不认', parseAmountToCents('1.234'), null)
check('中文不认', parseAmountToCents('十二块'), null)
check('空不认', parseAmountToCents(''), null)

check('monthOf', monthOf('2026-10-03'), '2026-10')
check('formatCents', formatCents(123450, '¥'), '¥1234.50')

const entries = [
  { id: '1', date: '2026-10-01', cents: 3000, kind: 'expense', category: '餐饮', note: null },
  { id: '2', date: '2026-10-02', cents: 1000, kind: 'expense', category: '餐饮', note: null },
  { id: '3', date: '2026-10-02', cents: 2000, kind: 'expense', category: '交通', note: null },
  { id: '4', date: '2026-10-05', cents: 500000, kind: 'income', category: '工资', note: null },
  { id: '5', date: '2026-09-30', cents: 9999, kind: 'expense', category: '购物', note: null },
]

const s = summarize(entries, '2026-10')
check('支出合计', s.expense, 6000)
check('收入合计', s.income, 500000)
check('结余', s.balance, 494000)
check('笔数只算当月', s.count, 4)
check('分类降序', s.byCategory.map((row) => row.category), ['餐饮', '交通'])
check('分类金额', s.byCategory[0].cents, 4000)
check('分类占比', Math.round(s.byCategory[0].share * 100), 67)
check('别的月份不影响', summarize(entries, '2026-09').expense, 9999)
check('空月份', summarize(entries, '2025-01').count, 0)

console.log(failed ? `\n${failed} 项失败` : '\n全部通过')
process.exit(failed ? 1 : 0)
