/**
 * Host half of dsh-ledger-dock —— 记账本的宿主半。
 *
 * 纯本地，不联网。金额一律存成**分为单位的整数**（避免浮点累加误差），
 * 显示时再除 100；这是记账类程序最容易被忽略的坑。
 */

import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createStateStore } from './state.js'

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const DEFAULTS = {
  currency: '¥',
  categories: ['餐饮', '交通', '购物', '居住', '医疗', '娱乐', '学习', '人情', '其他'],
  incomeCategories: ['工资', '报销', '其他收入'],
}

const ROUTE_STATE = '/dsh-ledger/state'

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const stateStore = createStateStore(join(DSH_HOME, 'dsh-ledger-dock', 'state.json'), {
  entries: [], // [{ id, date:'YYYY-MM-DD', cents, kind:'expense'|'income', category, note }]
  selectedMonth: null,
  pendingQuestion: null,
})

function sendJson(res, status, payload) {
  try {
    const body = JSON.stringify(payload)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(body),
    })
    res.end(body)
  } catch {
    /* 连接已经断了 */
  }
}

export function dateKey(date) {
  const d = date instanceof Date ? date : new Date(date || Date.now())
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 'YYYY-MM-DD' → 'YYYY-MM'。 */
export function monthOf(key) {
  return String(key || '').slice(0, 7)
}

/**
 * 把用户输入的钱转成"分"。
 * 认 `12.5` / `12,5` / `￥12.5` / `12.5元` / 负号；转不出来给 null。
 */
export function parseAmountToCents(input) {
  if (typeof input === 'number' && Number.isFinite(input)) return Math.round(input * 100)
  const text = String(input == null ? '' : input)
    .replace(/[¥￥$,\s]/g, '')
    .replace(/元$/, '')
    .trim()
  if (!text) return null
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) return null
  return Math.round(Number(text) * 100)
}

export function formatCents(cents, currency) {
  const value = (Number(cents) || 0) / 100
  return `${currency || ''}${value.toFixed(2)}`
}

/** 某个月的汇总：支出、收入、结余、笔数、按分类（支出）降序。 */
export function summarize(entries, month) {
  const inMonth = (entries || []).filter((entry) => monthOf(entry.date) === month)
  let expense = 0
  let income = 0
  const byCategoryMap = new Map()
  for (const entry of inMonth) {
    const cents = Number(entry.cents) || 0
    if (entry.kind === 'income') {
      income += cents
      continue
    }
    expense += cents
    const key = entry.category || '其他'
    byCategoryMap.set(key, (byCategoryMap.get(key) || 0) + cents)
  }
  const byCategory = [...byCategoryMap.entries()]
    .map(([category, cents]) => ({ category, cents, share: expense ? cents / expense : 0 }))
    .sort((a, b) => b.cents - a.cents)
  return { month, expense, income, balance: income - expense, count: inMonth.length, byCategory }
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function sortEntries(entries) {
  return [...(entries || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
}

/** Host plugin body. */
function apply(ctx, config) {
  const cfg = config && typeof config === 'object' ? config : {}
  const opts = { ...DEFAULTS, ...cfg }
  const currency = String(opts.currency || '')

  ctx.inject(['tools'], (toolScoped) => {
    toolScoped.tools.register({
      name: 'ledger_panel',
      description:
        '读写 DSH 右侧栏「记账本」面板（本地存储）。' +
        'action=add 记一笔：需要 amount（元，可带小数），可选 category / note / date(YYYY-MM-DD，默认今天) / kind(expense|income，默认 expense)；' +
        'action=summary 看某月汇总（可给 month=YYYY-MM，默认本月）；action=list 看流水（可给 month、count）；' +
        'action=remove 删一条（需要 id）；action=state 看总览。',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['add', 'summary', 'list', 'remove', 'state'], description: '要做的动作。' },
          amount: { type: 'string', description: 'add：金额，单位元，如 12.5。' },
          category: { type: 'string', description: 'add：分类（不确定就写"其他"）。' },
          note: { type: 'string', description: 'add：备注。' },
          date: { type: 'string', description: 'add：YYYY-MM-DD，默认今天。' },
          kind: { type: 'string', enum: ['expense', 'income'], description: 'add：支出还是收入，默认支出。' },
          month: { type: 'string', description: 'summary/list：YYYY-MM。' },
          count: { type: 'number', description: 'list：最多几条，默认 20。' },
          id: { type: 'string', description: 'remove：账目 id。' },
        },
        required: ['action'],
        additionalProperties: false,
      },
      output: {
        schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
        render(_args, value) {
          return [{ type: 'text', text: String((value && value.text) || '') }]
        },
      },
      presentCall(args) {
        return { card: 'terminal', title: `ledger_panel ${String((args && args.action) || 'summary')}`.trim() }
      },
      async execute(args) {
        const action = String((args && args.action) || 'summary').toLowerCase()
        const today = dateKey(new Date())

        if (action === 'state') {
          const s = stateStore.get()
          const all = s.entries || []
          const months = [...new Set(all.map((entry) => monthOf(entry.date)))].sort().reverse()
          return { text: JSON.stringify({ 总笔数: all.length, 有记录的月份: months.slice(0, 6), 最近: months[0] || null, revision: s.revision }, null, 2) }
        }

        if (action === 'add') {
          const cents = parseAmountToCents(args.amount)
          if (cents === null) return { text: `amount 认不出来：「${args.amount}」（写成 12.5 这样）` }
          const kind = args.kind === 'income' ? 'income' : 'expense'
          const date = String(args.date || '').trim() || today
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { text: `date 要是 YYYY-MM-DD，收到「${date}」` }
          const allowed = kind === 'income' ? opts.incomeCategories || [] : opts.categories || []
          const category = String(args.category || '').trim() || (kind === 'income' ? '其他收入' : '其他')
          const entry = { id: newId(), date, cents, kind, category, note: String(args.note || '').trim() || null }
          const s = stateStore.get()
          const next = stateStore.patch({ entries: sortEntries([...(s.entries || []), entry]) })
          const summary = summarize(next.entries, monthOf(date))
          return {
            text:
              `已记：${date} ${kind === 'income' ? '收入' : '支出'} ${formatCents(cents, currency)} · ${category}` +
              `${entry.note ? ` · ${entry.note}` : ''}\n${monthOf(date)}：支出 ${formatCents(summary.expense, currency)} / 收入 ${formatCents(summary.income, currency)} / 结余 ${formatCents(summary.balance, currency)}` +
              `${allowed.length && !allowed.includes(category) ? `\n（提示：分类「${category}」不在预设里，预设是 ${allowed.join('/')}）` : ''}`,
          }
        }

        if (action === 'summary') {
          const s = stateStore.get()
          const month = String(args.month || '').trim() || monthOf(today)
          if (!/^\d{4}-\d{2}$/.test(month)) return { text: `month 要是 YYYY-MM，收到「${month}」` }
          const summary = summarize(s.entries, month)
          if (!summary.count) return { text: `${month} 还没有记录` }
          const lines = summary.byCategory.map(
            (row) => `  ${row.category}  ${formatCents(row.cents, currency)}  ${(row.share * 100).toFixed(0)}%`,
          )
          return {
            text:
              `${month}：支出 ${formatCents(summary.expense, currency)} / 收入 ${formatCents(summary.income, currency)} / 结余 ${formatCents(summary.balance, currency)}（${summary.count} 笔）\n` +
              (lines.length ? `按分类：\n${lines.join('\n')}` : '（这个月只有收入）'),
          }
        }

        if (action === 'list') {
          const s = stateStore.get()
          const month = String(args.month || '').trim() || monthOf(today)
          const count = Math.min(200, Math.max(1, Number(args.count) || 20))
          const rows = sortEntries(s.entries).filter((entry) => monthOf(entry.date) === month).slice(0, count)
          if (!rows.length) return { text: `${month} 没有流水` }
          return {
            text: rows
              .map(
                (entry) =>
                  `- ${entry.date}  ${entry.kind === 'income' ? '+' : '-'}${formatCents(entry.cents, currency)}  ${entry.category}${entry.note ? `  ${entry.note}` : ''}\n  id=${entry.id}`,
              )
              .join('\n'),
          }
        }

        if (action === 'remove') {
          const id = String(args.id || '').trim()
          if (!id) return { text: 'remove 需要 id' }
          const s = stateStore.get()
          const target = (s.entries || []).find((entry) => entry.id === id)
          if (!target) return { text: `找不到 id=${id}` }
          const next = stateStore.patch({ entries: (s.entries || []).filter((entry) => entry.id !== id) })
          return { text: `已删：${target.date} ${formatCents(target.cents, currency)} ${target.category}（剩 ${next.entries.length} 笔）` }
        }

        return { text: `不认识的动作：${action}` }
      },
    })
  })

  ctx.inject(['webServer'], (scoped) => {
    const disposers = []
    disposers.push(
      scoped.webServer.register({
        kind: 'exact',
        path: ROUTE_STATE,
        handler: (req, res) => {
          const method = String((req && req.method) || 'GET').toUpperCase()
          const headers = (req && req.headers) || {}
          if (String(headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site') {
            res.statusCode = 403
            res.end()
            return
          }
          if (method === 'GET' || method === 'HEAD') {
            const s = stateStore.get()
            const month = monthOf(dateKey(new Date()))
            sendJson(res, 200, {
              ok: true,
              today: dateKey(new Date()),
              currency,
              categories: opts.categories,
              incomeCategories: opts.incomeCategories,
              month,
              summary: summarize(s.entries, month),
              state: s,
            })
            return
          }
          if (method === 'POST') {
            let raw = ''
            req.on('data', (chunk) => {
              raw += chunk
              if (raw.length > 4 * 1024 * 1024) req.destroy()
            })
            req.on('end', () => {
              let body = {}
              try {
                body = raw.trim() ? JSON.parse(raw) : {}
              } catch {
                sendJson(res, 400, { ok: false, error: '请求体不是 JSON' })
                return
              }
              if (Array.isArray(body.entries)) body.entries = sortEntries(body.entries)
              sendJson(res, 200, { ok: true, state: stateStore.patch(body) })
            })
            return
          }
          res.statusCode = 405
          res.end()
        },
      }),
    )

    ctx.on('dispose', () => {
      for (const off of disposers) {
        try {
          off()
        } catch {
          /* already gone */
        }
      }
    })
  })
}

export { apply, ROUTE_STATE, DEFAULTS }
