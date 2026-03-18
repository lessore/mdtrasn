# 项目当前状态

> 最后更新：2026-03-18 22:52
> 当前主进程：20260318-2252-codex-main
> Git 同步：`origin/main` 已执行 `pull --ff-only`，本次存档将以 checkpoint 形式提交并推送

## 项目目标

维护 `mdtrans` 这套面向 Typora/Markdown skill 的本地翻译工具，并并行沉淀 Desktop V1 的产品与架构文档。

## 当前进展

- `mdtrans` 已具备 CLI + 本地 Web UI，可做单文件/目录翻译，支持火山引擎和 OpenRouter/OpenAI-compatible 两类翻译引擎。
- 最近一轮把翻译工作台改成页面内可配置模式，支持切换 provider、本地保存 UI 偏好、可选输出路径，以及在 Typora 中打开结果。
- Markdown 翻译链路已补上 frontmatter 值翻译，`description` 这类 skill 头部字段会进入翻译；`<Use_When>` 这类伪标签也做了保护，避免结构损坏。
- `autopilot/SKILL.md` 已验证可翻，输出示例在 `/Users/lsh/Desktop/autopilot/translated-zh/SKILL.zh.md`。
- `AGENTS.md` 与 `AGENTS.zh.md` 已加入 `.gitignore`，并从 Git 跟踪中移除。
- 仓库里另有 Desktop V1 规划文档，最近新增了总体计划、模块边界、IPC 草案和目录结构自动更新脚本。

## 下一步

- 优先验证并修复 UI 里的“选择文件 / 选择目录”交互，当前这块仍在反复调整，用户反馈过点击后卡住。
- 在 UI 中补“停止翻译/中断当前任务”能力，避免长时间无响应时只能等待。
- 继续优化 skill 文档翻译质量，重点看头部元信息、调用示例和术语统一。

## 当前阻塞 / 风险

- macOS 原生文件选择器在当前 UI 服务进程里的行为不稳定，可能导致前端长时间停在“处理中”。
- 大模型翻译质量依赖模型与提示词；部分 OpenRouter 模型会触发 provider 侧隐私/策略限制，表现为 404 或空结果。
- 当前仓库既有工具代码又有 Desktop V1 文档，接手时需要先确认本轮目标是修 UI/翻译工具，还是继续推进桌面版规划。

## 关键文件

- `src/ui.ts`
- `src/markdown.ts`
- `src/service.ts`
- `src/translator/openai-compatible.ts`
- `src/typora.ts`
- `plan/desktop-v1-master-plan.md`
- `docs/product/desktop-v1/README.md`

## 业务改动状态

- 当前业务文件工作树干净，没有未提交的业务改动。
- 本次 save-game 只会新增 `.handoff/` 状态文件，不会混入业务文件提交。
- 下一个工作空间可以直接从最新 `main` 开始，不需要先清理本地改动。

## 给下一个 Codex 的启动说明

- 先打开 `src/ui.ts`，重点看 `/api/pick-path` 对应的 `choosePath` 实现，这是当前最可能继续返工的地方。
- 再看 `src/markdown.ts`，确认 frontmatter 翻译和伪标签保护是否符合新的 skill 样本。
- 如果用户继续测 UI，优先做最短路径修复：先让选择器稳定，再做“停止翻译”。
- 如果转去继续规划桌面版，再从 `plan/desktop-v1-master-plan.md` 和 `docs/product/desktop-v1/README.md` 接着推进。
