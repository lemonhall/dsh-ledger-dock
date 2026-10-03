# 记账这件事，我把它做进了 DSH 的右侧栏

💰 **记账本** —— DSH 右侧栏的一个新 tab。

## 为什么做这个

记一笔账的成本必须低到顺手就记了。打开 app、找分类、填表，那就不记了。

## 长什么样

![记账本](https://cdn.jsdelivr.net/gh/lemonhall/dsh-ledger-dock@main/docs/screenshot-panel.png)

（图只截了右侧栏面板。我这台机器桌面左下角有真名，所以截图从来不整屏。）

## 它能干什么

- **金额一律存成「分」的整数**（不用浮点）—— 记账类程序最容易翻车的地方
- 输入认 `12.5` / `￥12.50` / `12.5元` / `1,234.5`，拒三位小数和中文数字
- 本月支出/收入/结余 + 当月流水 + 按分类的条形统计
- `ledger_panel` 工具：`add` / `summary` / `list` / `remove`
- 21 项单测（金额解析边界 + 汇总口径）

## 一个值得说的设计决定

**金额一律存成分的整数，不用浮点。** 0.1 + 0.2 那个故事在记账程序里是致命的 —— 小数累加会漂，月末对不上账，你就再也不信这个软件了。输入解析认 `12.5`、`￥12.50`、`12.5元`、`1,234.5`，但拒三位小数和中文数字：宁可让人重输一次，也别猜错。

## 双向的，不只看

这是这批插件的共同点：**状态在宿主、界面 2 秒轮询**。所以我在面板里点一下，Agent 调工具就能读到；Agent 写一次（比如「帮我记一笔午饭 12.5」），面板自己就变了。

装：

```
# 先装 DSH（桌面版从 https://harness.deepseek.com 下载安装包；只要 CLI 的话）：
npm i -g @deepseek-ai/dsh

# 再装这个插件（桌面版也可以走 GUI：右侧栏「插件 → 添加插件」）
dsh plugin --profile desktop add dsh-ledger-dock

# 如果你是开发者、想用本地目录直接挂：
plugin_manager install_bundle target=link:E:\development\dsh-ledger-dock
```

代码在 <https://github.com/lemonhall/dsh-ledger-dock>，npm 上是 `dsh-ledger-dock`。右侧栏点「**+**」→ 选「记账本」就能看到它。

## 已知限制

- 只有**单币种**（配置里改符号，不做汇率换算）
- 不做预算、不做周期账单、不做导入导出（数据就在 `state.json` 里，想导随时拷）
- 统计只有"按月 + 按分类"，没有同比环比
