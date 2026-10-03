# dsh-ledger-dock 💰

DSH 右侧栏的**记账本**：记一笔、看本月结余、按分类统计。

> 这是给 [DSH（DeepSeek Harness）](https://github.com/deepseek-ai/deepseek-harness) 右侧栏做的一排日常插件之一。
> 右侧栏本来就是 DSH 的「apps 入口」—— 官方的文件/终端/浏览器和第三方插件走的是**完全同一套机制**。

## 效果

![面板](https://cdn.jsdelivr.net/gh/lemonhall/dsh-ledger-dock@main/docs/screenshot-panel.png)

（截图只裁了右侧栏面板。想换订阅源/分类/时长这些，改配置就行，不用碰代码。）

## 它能干什么

- **金额一律存成「分」的整数**（不用浮点）—— 记账类程序最容易翻车的地方
- 输入认 `12.5` / `￥12.50` / `12.5元` / `1,234.5`，拒三位小数和中文数字
- 本月支出/收入/结余 + 当月流水 + 按分类的条形统计
- `ledger_panel` 工具：`add` / `summary` / `list` / `remove`
- 21 项单测（金额解析边界 + 汇总口径）

## 装

```
plugin_manager  install_bundle  target=link:E:\development\dsh-ledger-dock
```

或从 npm：

```
dsh plugin --profile <你的 profile> add dsh-ledger-dock
```

装好之后：右侧栏点「**+**」→ 选「**记账本**」。

⚠️ **客户端半边改动要重启一次应用**；宿主半边热生效 —— 但**新增宿主路由要重启**（实测，别指望热重载）。

## 它是怎么work的

```
lib/index.js    宿主半：路由 + ledger_panel 工具（Agent 侧读写同一份状态）
lib/state.js    本地状态（原子写：临时文件 + rename，读的人不会撞上写了一半的文件）
lib/client.js   右侧栏 tab（整个模块包在 IIFE 里 —— DSH 把所有客户端插件拼成一个脚本，
                顶层 const 会跨插件撞名，实测撞过一次直接把应用挡在启动之外）
```

**双向通道**：状态存在宿主，客户端 2 秒轮询。所以**你在面板里点一下，Agent 调工具就能读到**；
**Agent 写一次，面板自己会跟着变**。这不是"一个只读的看板"。

## 已知限制

- 只有**单币种**（配置里改符号，不做汇率换算）
- 不做预算、不做周期账单、不做导入导出（数据就在 `state.json` 里，想导随时拷）
- 统计只有"按月 + 按分类"，没有同比环比

## License

MIT
