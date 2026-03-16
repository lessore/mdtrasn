# mdtrans Desktop V1 设计文档索引

本目录承载 Chapter 0 与 Chapter 1 的正式产物，作为桌面化实现前的产品设计基线。

## 文档列表
- `00-baseline-audit.md`：基线盘点（保留/重构/下线 + 风险）
- `01-information-architecture.md`：信息架构定稿
- `02-wireframes.md`：线框图（桌面主断点）
- `03-interaction-spec.md`：关键流程交互稿
- `release-readiness-checklist.md`：发布门禁检查清单（Chapter 5）
- `post-launch-roadmap.md`：上线后迭代路线（Chapter 6）
- `assets/`：最终版图像资产（可追踪）

## 阅读顺序
1. 先读 `00-baseline-audit.md`，理解现状边界。
2. 再读 `01-information-architecture.md`，确认页面职责与导航。
3. 再读 `02-wireframes.md`，确认页面布局与组件层级。
4. 最后读 `03-interaction-spec.md`，确认流程与状态闭环。

## 评审标准
- IA：6 个核心页面职责不重叠。
- 线框：每个页面都有主操作、状态反馈、下一步动作。
- 交互：覆盖首次启动、批量翻译、失败修复、历史复跑四条核心链路。
- 一致性：文档命名、术语、状态标签统一。
