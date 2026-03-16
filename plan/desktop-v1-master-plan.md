# mdtrans Desktop V1 全局实施计划（Chapter 0-6）

> 版本：v1.0  
> 状态：执行中（Chapter 1 优先）  
> 更新时间：2026-03-16

## 1. 目标与边界

### 1.1 总目标
将当前本地 Web 控制台（`src/ui.ts`）升级为桌面可直达应用，覆盖从产品设计、技术架构、工程落地到验证发布与迭代的完整闭环。

### 1.2 固定边界
- 平台：macOS 优先
- 用户模式：个人离线优先
- 交互形态：纯工作台（非向导）
- 兼容策略：CLI 继续兼容（`src/cli.ts`）
- 过程策略：第一章先执行，但计划必须覆盖全局

### 1.3 全局成功标准
- 新用户 5 分钟内完成首次“翻译并打开结果”。
- 熟练用户在工作台 3 步完成常规任务（选源 -> 运行 -> 查看/打开）。
- 失败任务 1 分钟内完成定位并触发重试。
- CLI 既有命令行为不回归。

## 2. 全局阶段路线（Chapter 0-6）

## Chapter 0：基线盘点（Current State Audit）
### 目标
形成真实现状、痛点与风险清单，避免后续设计脱离现有系统能力。

### 输入
- 代码：`src/cli.ts`、`src/ui.ts`、`src/service.ts`、`src/config.ts`、`src/watch.ts`
- 文档：`README.md`、`plan/markdown-skill-translation-plan.md`

### 实施步骤
1. 枚举现有可用能力：CLI、Web UI、配置、缓存、Typora 集成、watch。
2. 识别用户关键路径与阻断点（首次使用、批量翻译、失败恢复）。
3. 输出“保留/重构/下线”三类列表。
4. 记录高风险项（密钥管理、错误可诊断性、跨模块耦合点）。

### 产物
- `docs/product/desktop-v1/00-baseline-audit.md`

### 验收退出条件
- 保留/重构/下线分类完整。
- 风险项附带可执行缓解策略。

---

## Chapter 1：信息架构 + 线框图 + 交互稿（当前优先）
### 目标
产出可直接用于开发的产品设计基线文档，覆盖页面结构与核心交互闭环。

### 实施步骤
1. 定义全局导航与页面职责。
2. 固化 6 个核心页面信息结构。
3. 产出每个页面线框（桌面主断点）。
4. 产出关键流程交互稿，覆盖正常流与异常恢复流。
5. 组织评审，冻结第一版范围。

### 产物
- `docs/product/desktop-v1/README.md`
- `docs/product/desktop-v1/01-information-architecture.md`
- `docs/product/desktop-v1/02-wireframes.md`
- `docs/product/desktop-v1/03-interaction-spec.md`

### 验收退出条件
- 6 个核心页面全覆盖：工作台、翻译任务、结果中心、术语与规则、历史记录、设置。
- 4 条关键流程闭环：首次启动、批量翻译、失败修复、历史复跑。
- 每个页面都有主操作、状态反馈、下一步动作。

---

## Chapter 2：桌面化技术架构定稿
### 目标
冻结桌面化方案，明确主进程/渲染进程职责与 IPC 契约草案。

### 实施步骤
1. 决策桌面壳技术路线（优先 Electron/Tauri 二选一并 ADR 定稿）。
2. 定义进程边界与模块分层：UI、应用服务、翻译核心适配层、持久化层。
3. 设计 IPC 接口草案（任务创建/执行、状态订阅、历史查询、设置读写）。
4. 明确日志、错误码、可观测性字段。

### 产物
- `docs/architecture/desktop-v1/ADR-001-shell-and-process-model.md`
- `docs/architecture/desktop-v1/module-boundaries.md`
- `docs/architecture/desktop-v1/ipc-contract-draft.md`

### 验收退出条件
- 关键接口冻结，可进入编码。
- 架构决策包含备选方案对比与取舍说明。

---

## Chapter 3：工程落地与目录重构
### 目标
建立“翻译核心稳定 + 桌面前端独立演进”的工程骨架。

### 实施步骤
1. 创建 `apps/desktop` 作为桌面入口目录。
2. 明确 `src/` 继续作为核心引擎层，避免一次性大迁移。
3. 建立构建和测试分层脚本策略（核心层与桌面层分离）。
4. 完善 `.gitignore`，剔除打包产物和设计临时文件噪音。

### 产物
- `apps/desktop/README.md`
- `.gitignore` 扩展规则

### 验收退出条件
- 目录职责清晰。
- 不破坏现有 CLI 构建与测试链路。

---

## Chapter 4：功能迁移与体验升级
### 目标
将当前单页 Web 控制台能力迁移为桌面多页面工作台体验。

### 实施步骤
1. 按 Chapter 1 文档拆分页面模块。
2. 接入核心翻译能力：任务执行、进度状态、结果汇总。
3. 实现失败重试与问题定位闭环。
4. 接入历史复跑与设置读写。

### 产物
- 桌面应用 Alpha 版本
- 页面功能验收清单

### 验收退出条件
- 高频路径 3 步闭环。
- 失败恢复在 UI 可操作，不依赖手工改文件。

---

## Chapter 5：验证与发布准备
### 目标
完成质量门禁与发布包准备。

### 实施步骤
1. 功能测试：单文件、目录、重试、历史复跑。
2. 兼容测试：CLI 与配置格式兼容。
3. 可用性测试：首次成功率、错误恢复时长。
4. 打包测试：安装、启动、升级、卸载。
5. 发布清单与回滚策略确认。

### 产物
- `docs/product/desktop-v1/release-readiness-checklist.md`
- 测试报告与首发说明

### 验收退出条件
- 通过发布门禁后才进入上线。

---

## Chapter 6：上线后迭代（V1.1/V1.2）
### 目标
建立可持续迭代机制。

### 实施步骤
1. 归集真实使用反馈并分级。
2. 建立问题优先级与迭代节奏。
3. 输出版本路线图与每月里程碑。

### 产物
- `docs/product/desktop-v1/post-launch-roadmap.md`
- 月度迭代看板

### 验收退出条件
- 形成稳定的月度迭代闭环。

## 3. 接口与工程规则

### 3.1 Public 接口策略
- 现有 CLI 继续兼容：`translate`、`watch`、`open`、`ui`。
- 桌面层新增接口：
  - 任务创建
  - 任务执行
  - 结果查询
  - 历史复跑
  - 设置读写
- 敏感字段统一掩码展示并单独存储策略。

### 3.2 目录结构目标
- `src/`：翻译核心引擎（保留）
- `apps/desktop/`：桌面应用入口（新增）
- `docs/product/desktop-v1/`：产品设计资产
- `docs/architecture/desktop-v1/`：架构决策与接口文档
- `plan/`：计划与里程碑

### 3.3 `.gitignore` 策略
- 桌面打包产物：`release/`、`out/`、`dist-desktop/`、`*.dmg`、`*.pkg`、`*.exe`、`*.msi`、`*.AppImage`
- 设计临时文件：`docs/product/**/.cache/`、`docs/product/**/tmp/`、`docs/product/**/drafts/`
- 通用噪音：`logs/`、`*.log`、`*.tmp`、`*.swp`、`.idea/`
- 保留可追踪：`docs/product/desktop-v1/assets/` 最终版资产不忽略

## 4. 里程碑与执行顺序
1. M1：完成 Chapter 0 + Chapter 1 文档交付并评审通过。
2. M2：完成 Chapter 2 架构冻结。
3. M3：完成 Chapter 3 工程骨架与目录治理。
4. M4：完成 Chapter 4 Alpha 功能迁移。
5. M5：完成 Chapter 5 发布门禁。
6. M6：进入 Chapter 6 持续迭代。

## 5. 风险与应对
- 风险：一次性重构导致核心翻译回归。
  - 应对：坚持核心引擎与桌面壳分层，不先迁移 `src/`。
- 风险：错误反馈不透明导致用户无法自愈。
  - 应对：交互稿中强制“错误原因 + 下一步动作”。
- 风险：设计与实现脱节。
  - 应对：Chapter 1 文档直接映射 Chapter 2 IPC 与 Chapter 4 页面模块。

## 6. 当前执行状态
- 已执行：Chapter 1（文档交付）与 Chapter 0/2/3 的基础文档与目录准备。
- 待执行：Chapter 4-6 的实现、验证与迭代。
