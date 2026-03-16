# Chapter 0 基线盘点（Current State Audit）

## 1. 现有能力清单

### CLI（`src/cli.ts`）
- `translate <path>`：单文件/目录翻译
- `watch <path>`：监听后自动重翻
- `open <path>`：调用 Typora 打开路径
- `ui`：启动本地 Web 控制台

### 翻译执行（`src/service.ts`）
- 支持单文件与目录两种翻译路径
- 支持输出覆盖、镜像目录、同目录副本策略
- 支持缓存命名空间（按 provider/model/lang 隔离）
- 支持结果摘要与失败清单写入 `.mdtrans-cache/last-run.json`

### 配置与术语（`src/config.ts`）
- `mdtrans.config.json` + 默认配置合并
- `glossary.json` 支持 `preserve` 与 `translateAs`
- 支持 provider 切换：`openai-compatible` / `volcengine-translate` / `mock`

### 轻量 Web UI（`src/ui.ts`）
- 已有单页三段式工作流：
  - 选择内容
  - 选择翻译方式
  - 查看结果
- 支持文件/目录选择、设置保存、翻译触发、结果查看

### 监听模式（`src/watch.ts`）
- 目录/文件监听 + 防抖重跑
- 适合长期文档翻译场景

## 2. 当前痛点
- 信息密度与功能在单页内增长，后续扩展（历史、术语管理、任务管理）会拥挤。
- 失败恢复仍偏“日志导向”，可操作路径不足。
- 历史与配置复用能力较弱，重复操作成本高。
- 桌面应用尚未建立标准工程入口，后续打包与发布链路未成型。

## 3. 保留 / 重构 / 下线

### 保留
- 翻译核心引擎（`src/service.ts`、`src/markdown.ts`、`src/translator/*`）
- CLI 协议（`translate/watch/open/ui`）
- 配置与术语表格式（降低迁移成本）

### 重构
- UI 结构：单页 -> 多页面工作台
- 任务生命周期：仅执行 -> 可追踪、可重试、可复跑
- 错误反馈：文本提醒 -> 结构化问题面板 + 下一步动作
- 设置管理：散点配置 -> 集中设置页

### 下线（V1 不做）
- 账号与云同步
- 团队协作与权限
- 订阅计费与商业化闭环

## 4. 风险清单与缓解
- 风险：桌面化改造牵连核心翻译逻辑。
  - 缓解：保持 `src/` 稳定，桌面层仅做编排与展示。
- 风险：错误信息不可诊断导致支持成本上升。
  - 缓解：统一错误码 + 失败原因 + 重试建议。
- 风险：设计稿与实现脱节。
  - 缓解：交互稿必须映射到接口草案（Chapter 2）与页面模块（Chapter 4）。
