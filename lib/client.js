/**
 * Client half of dsh-ledger-dock —— 右侧栏的「记账本」tab。
 *
 * 纯 DOM。账目真相在宿主，2 秒轮询 —— Agent 用 ledger_panel 记的账，界面自己出来。
 * ⚠️ 整个模块包在 IIFE 里（DSH 把客户端插件拼成一个脚本，顶层 const 会撞名）。
 */

;(() => {
const TAB_KIND = 'ledger'
const TAB_ID = 'dsh-ledger-dock:ledger'
const ROUTE_STATE = '/dsh-ledger/state'

window.__ModuleLoader__.load({
  id: 'dsh-ledger-dock',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const C = {
      bg: 'var(--dsw-alias-bg-base)',
      border: 'var(--dsw-alias-border-l1)',
      text: 'var(--dsw-alias-label-primary)',
      dim: 'var(--dsw-alias-label-secondary)',
      accent: 'var(--dsw-alias-brand-primary, #5a7cff)',
      up: '#ff5a4d', // 中式：红=支出/花掉
      down: '#3ddc84',
      mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    }

    const label = (cents, currency) => `${currency}${((Number(cents) || 0) / 100).toFixed(2)}`

    function monthOf(key) {
      return String(key || '').slice(0, 7)
    }

    function shiftMonth(month, delta) {
      const [y, m] = String(month).split('-').map(Number)
      const date = new Date(y, (m || 1) - 1 + delta, 1)
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    }

    function MonthSummary(entries, month) {
      let expense = 0
      let income = 0
      const byCategory = new Map()
      for (const entry of entries) {
        if (monthOf(entry.date) !== month) continue
        const cents = Number(entry.cents) || 0
        if (entry.kind === 'income') {
          income += cents
        } else {
          expense += cents
          byCategory.set(entry.category || '其他', (byCategory.get(entry.category || '其他') || 0) + cents)
        }
      }
      return {
        expense,
        income,
        balance: income - expense,
        rows: [...byCategory.entries()].map(([category, cents]) => ({ category, cents })).sort((a, b) => b.cents - a.cents),
      }
    }

    function LedgerPanel() {
      const [currency, setCurrency] = React.useState('¥')
      const [categories, setCategories] = React.useState([])
      const [incomeCategories, setIncomeCategories] = React.useState([])
      const [entries, setEntries] = React.useState([])
      const [month, setMonth] = React.useState(() => new Date().toISOString().slice(0, 7))
      const [kind, setKind] = React.useState('expense')
      const [amount, setAmount] = React.useState('')
      const [category, setCategory] = React.useState('')
      const [note, setNote] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const revisionRef = React.useRef(-1)

      const pushState = React.useCallback((patch) => {
        fetch(ROUTE_STATE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        }).catch(() => {})
      }, [])

      const pull = React.useCallback(() => {
        setBusy(true)
        return fetch(ROUTE_STATE)
          .then((response) => response.json())
          .then((payload) => {
            if (!payload || !payload.ok) return
            const state = payload.state || {}
            revisionRef.current = state.revision || 0
            setEntries(state.entries || [])
            if (payload.currency) setCurrency(payload.currency)
            if (Array.isArray(payload.categories)) setCategories(payload.categories)
            if (Array.isArray(payload.incomeCategories)) setIncomeCategories(payload.incomeCategories)
            if (payload.month) setMonth((current) => current || payload.month)
          })
          .catch(() => {})
          .finally(() => setBusy(false))
      }, [])

      React.useEffect(() => {
        pull()
        const timer = setInterval(() => {
          fetch(ROUTE_STATE)
            .then((response) => response.json())
            .then((payload) => {
              if (!payload || !payload.ok) return
              const state = payload.state || {}
              if ((state.revision || 0) !== revisionRef.current) {
                revisionRef.current = state.revision || 0
                setEntries(state.entries || [])
              }
            })
            .catch(() => {})
        }, 2000)
        return () => clearInterval(timer)
      }, [pull])

      const summary = React.useMemo(() => MonthSummary(entries, month), [entries, month])
      const rows = React.useMemo(
        () =>
          entries
            .filter((entry) => monthOf(entry.date) === month)
            .sort((a, b) => String(b.date).localeCompare(String(a.date))),
        [entries, month],
      )
      const catList = kind === 'income' ? incomeCategories : categories

      const add = () => {
        const text = amount.trim().replace(/[¥￥$,\s]/g, '').replace(/元$/, '')
        if (!/^-?\d+(\.\d{1,2})?$/.test(text)) return
        const cents = Math.round(Number(text) * 100)
        const today = new Date()
        const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
        const entry = {
          id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          date,
          cents,
          kind,
          category: category || (kind === 'income' ? '其他收入' : '其他'),
          note: note.trim() || null,
        }
        const next = [entry, ...entries]
        setEntries(next)
        setAmount('')
        setNote('')
        pushState({ entries: next })
      }

      const remove = (entry) => {
        const next = entries.filter((item) => item.id !== entry.id)
        setEntries(next)
        pushState({ entries: next })
      }

      const maxCat = summary.rows.length ? summary.rows[0].cents : 1

      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', height: '100%', background: C.bg, color: C.text } },
        // 顶栏 + 月份
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 12px', borderBottom: `1px solid ${C.border}`, fontSize: 12 } },
          h('span', { style: { fontWeight: 600 } }, '💰 记账本'),
          h('span', { style: { marginLeft: 'auto', fontFamily: C.mono, fontSize: 11, color: C.dim } }, month),
          h('button', { type: 'button', onClick: () => setMonth(shiftMonth(month, -1)), style: btn() }, '‹'),
          h('button', { type: 'button', onClick: () => setMonth(shiftMonth(month, 1)), style: btn() }, '›'),
          h('button', { type: 'button', onClick: pull, title: '刷新', style: btn() }, busy ? '…' : '⟳'),
        ),
        // 本月三数
        h(
          'div',
          { style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '8px 12px', borderBottom: `1px solid ${C.border}`, fontFamily: C.mono } },
          [
            { label: '支出', value: summary.expense, color: C.up },
            { label: '收入', value: summary.income, color: C.down },
            { label: '结余', value: summary.balance, color: summary.balance >= 0 ? C.text : C.up },
          ].map((item) =>
            h(
              'div',
              { key: item.label, style: { textAlign: 'center' } },
              h('div', { style: { fontSize: 10, color: C.dim } }, item.label),
              h('div', { style: { fontSize: 14, color: item.color } }, label(item.value, currency)),
            ),
          ),
        ),
        // 记一笔
        h(
          'div',
          { style: { display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 10px', borderBottom: `1px solid ${C.border}` } },
          h(
            'div',
            { style: { display: 'flex', gap: 3, flex: 'none' } },
            [
              { key: 'expense', text: '支出' },
              { key: 'income', text: '收入' },
            ].map((item) =>
              h(
                'span',
                {
                  key: item.key,
                  onClick: () => {
                    setKind(item.key)
                    setCategory('')
                  },
                  style: {
                    fontSize: 10.5,
                    padding: '2px 6px',
                    borderRadius: 5,
                    cursor: 'pointer',
                    border: `1px solid ${C.border}`,
                    color: kind === item.key ? C.text : C.dim,
                    background: kind === item.key ? `color-mix(in srgb, ${C.accent} 22%, transparent)` : 'transparent',
                  },
                },
                item.text,
              ),
            ),
          ),
          h('input', {
            value: amount,
            onChange: (event) => setAmount(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter') add()
            },
            placeholder: '金额',
            style: { width: 74, flex: 'none', ...input() },
          }),
          h(
            'select',
            {
              value: category,
              onChange: (event) => setCategory(event.target.value),
              style: { flex: 'none', ...input(), width: 74 },
            },
            [h('option', { key: '', value: '' }, '分类'), ...catList.map((name) => h('option', { key: name, value: name }, name))],
          ),
          h('input', {
            value: note,
            onChange: (event) => setNote(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter') add()
            },
            placeholder: '备注（可空）',
            style: { flex: '1 1 90px', minWidth: 60, ...input() },
          }),
          h('button', { type: 'button', onClick: add, style: { ...btn(), padding: '2px 10px' } }, '记一笔'),
        ),
        // 主体：流水 + 分类
        h(
          'div',
          { style: { flex: '1 1 auto', minHeight: 0, display: 'flex' } },
          h(
            'div',
            { style: { flex: '1 1 auto', minWidth: 0, overflow: 'auto', padding: '4px 6px 12px' } },
            rows.length
              ? rows.map((entry) =>
                  h(
                    'div',
                    { key: entry.id, style: { display: 'flex', alignItems: 'baseline', gap: 7, padding: '4px 6px', borderRadius: 6, fontSize: 12 } },
                    h('span', { style: { fontFamily: C.mono, fontSize: 10, color: C.dim, flex: 'none' } }, entry.date.slice(5)),
                    h('span', { style: { flex: 'none' } }, entry.category),
                    h(
                      'span',
                      { style: { flex: '1 1 auto', minWidth: 0, color: C.dim, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                      entry.note || '',
                    ),
                    h(
                      'span',
                      { style: { fontFamily: C.mono, flex: 'none', color: entry.kind === 'income' ? C.down : C.up } },
                      `${entry.kind === 'income' ? '+' : '−'}${label(entry.cents, currency)}`,
                    ),
                    h('span', { onClick: () => remove(entry), title: '删除', style: { cursor: 'pointer', color: C.dim, flex: 'none' } }, '✕'),
                  ),
                )
              : h('div', { style: { padding: 12, fontSize: 11.5, color: C.dim } }, '这个月还没记账'),
          ),
          // 分类统计
          h(
            'div',
            { style: { width: 190, flex: 'none', borderLeft: `1px solid ${C.border}`, overflow: 'auto', padding: '6px 8px' } },
            h('div', { style: { fontSize: 10.5, color: C.dim, marginBottom: 5 } }, `按分类（${month}）`),
            summary.rows.length
              ? summary.rows.map((row) =>
                  h(
                    'div',
                    { key: row.category, style: { marginBottom: 5 } },
                    h(
                      'div',
                      { style: { display: 'flex', fontSize: 11 } },
                      h('span', null, row.category),
                      h('span', { style: { marginLeft: 'auto', fontFamily: C.mono, fontSize: 10.5, color: C.dim } }, label(row.cents, currency)),
                    ),
                    h(
                      'div',
                      { style: { height: 3, borderRadius: 3, marginTop: 2, background: `color-mix(in srgb, ${C.accent} 16%, transparent)` } },
                      h('div', {
                        style: {
                          height: '100%',
                          width: `${Math.max(3, Math.round((row.cents / maxCat) * 100))}%`,
                          borderRadius: 3,
                          background: C.accent,
                        },
                      }),
                    ),
                  ),
                )
              : h('div', { style: { fontSize: 11, color: C.dim } }, '（本月没有支出）'),
          ),
        ),
      )
    }

    function btn() {
      return {
        border: `1px solid ${C.border}`,
        background: 'transparent',
        color: C.text,
        borderRadius: 6,
        fontSize: 12,
        padding: '1px 6px',
        cursor: 'pointer',
      }
    }

    function input() {
      return {
        background: 'transparent',
        border: `1px solid ${C.border}`,
        borderRadius: 6,
        color: C.text,
        fontSize: 11.5,
        padding: '3px 6px',
        outline: 'none',
      }
    }

    function LedgerBody() {
      return h(LedgerPanel)
    }

    function LedgerTitle() {
      return h(
        'span',
        { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
        h('span', { 'aria-hidden': 'true' }, '💰'),
        h('span', null, '记账本'),
      )
    }

    const inject = ['slots', 'sidebarRightTabs']

    function apply(ctx) {
      ctx.inject(['sidebarRightTabs'], (scoped) => {
        scoped.sidebarRightTabs.register({
          id: TAB_ID,
          kind: TAB_KIND,
          priority: 'extension',
          title: () => '记账本',
          guide: [
            {
              id: TAB_KIND,
              kind: TAB_KIND,
              order: 90,
              title: () => '记账本',
              description: () => '记一笔 · 本月结余 · 分类统计',
              icon: () => h('span', { style: { fontSize: 16 } }, '💰'),
            },
          ],
        })
      })
      ctx.inject(['slots'], (scoped) => {
        scoped.slots.inject('sidebar.right.pane.tab', () =>
          scoped.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, LedgerBody),
        )
        scoped.slots.inject('sidebar.right.pane.tab.title', () =>
          scoped.slots.register({ name: 'sidebar.right.pane.tab.title', key: TAB_ID }, LedgerTitle),
        )
      })
    }

    exports.inject = inject
    exports.apply = apply
    return module.exports
  },
})
})()
