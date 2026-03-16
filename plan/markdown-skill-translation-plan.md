# Markdown Skill 翻译工具方案（MVP 先行，Typora 外挂优先）

## Summary
首发做一个 **macOS 优先的外挂式 Markdown 翻译工具**，而不是把 `Typora` 当作首发插件宿主。原因是 Typora 目前稳定可依赖的官方扩展点主要是主题、导出、Shell 打开文件等，没有稳定的官方通用插件 API；社区插件体系可作为二期实验，但不适合承担 MVP 的核心风险。

目标聚焦为：
- 支持 **单文件即翻即看** 和 **整目录批量翻译**
- 默认生成 **中文副本**，保留英文原文
- 只翻译 **自然语言内容**，保留代码块、命令、路径、frontmatter、标签名、API 名
- 翻译完成后可 **一键在 Typora 中打开译文**

计划产物保存目标：
- 目录：`/Users/lsh/Desktop/mdtrasn/plan/`
- 文件名：`/Users/lsh/Desktop/mdtrasn/plan/markdown-skill-translation-plan.md`

## Key Changes
### 1. 产品形态
- 做一个本地工具，采用 `CLI + 极简桌面 UI` 的组合
- CLI 负责批量处理、自动化、目录扫描、增量重翻
- UI 负责拖拽文件/文件夹、进度展示、打开 Typora
- MVP 只支持 `Markdown (.md)`，不做 Typora 内嵌插件

### 2. 核心工作流
1. 选择单文件或目录
2. 扫描 Markdown 文件并建立任务队列
3. 用 Markdown AST 解析文档
4. 识别“可翻译节点”和“保护节点”
5. 对可翻译文本分块调用在线翻译 API
6. 将译文回填并输出中文副本
7. 自动调用 Typora 打开译文或输出目录

默认输出策略：
- 单文件：`foo.md -> foo.zh.md`
- 批量目录：输出到独立镜像目录，如 `translated-zh/`

### 3. 技术设计
- 采用 `remark / mdast` 做 AST 级翻译，不用正则整文件替换
- 不翻译：
  - YAML frontmatter
  - fenced code block / inline code
  - HTML/XML 标签名与属性名
  - URL、图片路径、文件路径、命令、环境变量、API 名
- 只翻译：
  - 标题、段落、列表、引用、表格里的自然语言文本

翻译能力抽象：
- 定义统一 `TranslatorAdapter`
- 首发接在线 API
- 预留后续切换不同模型/服务的能力

质量保障：
- 术语表 `glossary`：固定关键术语译名或禁止翻译
- 翻译缓存：按段落哈希缓存
- 增量重翻：仅重翻变更段落

Typora 集成：
- 使用 macOS Shell 打开方式，如 `open -a Typora <file>`
- UI 提供“翻译后打开”和“打开输出目录”

### 4. 交付分期
Phase 1：MVP
- CLI 可翻单文件和目录
- 生成中文副本
- 保留 Markdown 结构
- 支持术语表、缓存
- 翻译完成后可在 Typora 打开

Phase 2：实用版
- 极简桌面 UI
- 拖拽翻译
- watch 模式
- 失败重试、错误报告、增量同步

Phase 3：实验性 Typora 集成
- 评估社区插件体系
- 只做“从 Typora 触发外部翻译”的桥接
- 若兼容性差，可直接取消，不影响主体方案

## Public APIs / Interfaces
建议一开始固定这些接口：
- CLI
  - `mdtrans translate <path>`
  - `mdtrans watch <path>`
  - `mdtrans open <path>`
- 配置文件
  - `mdtrans.config.json`
  - 字段：`sourceLang`, `targetLang`, `outputMode`, `outputDir`, `translator`, `glossary`, `ignorePatterns`, `openInTypora`
- 术语表
  - `glossary.json`
- 缓存
  - MVP 用 SQLite

## Test Plan
必须覆盖：
- skill 文件含 frontmatter、XML/HTML 标签、代码块、命令、路径时，输出结构不损坏
- 标题、列表、表格、引用翻译后仍是合法 Markdown
- 链接、图片路径、文件路径不被误改
- 单文件翻译后能直接在 Typora 打开
- 批量翻译时保留目录结构
- 文件小改后只重翻变更块
- glossary 生效，关键术语保持一致
- API 超时、失败、限流时有重试和失败清单

验收标准：
- skill 类 Markdown 95% 以上无需手工修结构
- 2k-5k 字 Markdown 能稳定输出可读中文副本
- 一个 `skills/` 目录可被持续重复批量翻译
- 用户能在 2 步内完成“翻译并在 Typora 查看”

## Assumptions And Defaults
已锁定默认值：
- 首发平台：`macOS`
- 首发形态：`外挂工具`
- 查看方式：`中文副本`
- 使用场景：`单文件 + 整目录批量`
- 翻译边界：`只翻自然语言`
- 翻译能力：`在线 API`
- Typora 的角色：`查看器/编辑器`，不是翻译引擎宿主
