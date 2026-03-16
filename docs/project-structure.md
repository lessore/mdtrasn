# 项目目录结构（两级）

- 生成时间：2026-03-16 17:32:50 CST
- 深度：2 级（仓库根目录 + 一级子项 + 二级子项）
- 说明：已排除体积较大或无须展示的目录（如 `node_modules`、`.git`、`dist` 等）

## 更新命令

```bash
bash scripts/update-project-structure.sh
```

## 目录图（两级）

```text
.
├── apps/
│   └── desktop/
├── docs/
│   ├── architecture/
│   ├── product/
│   └── vendor/
├── plan/
├── prompts/
├── scripts/
└── src/
    ├── test/
    └── translator/
```

## 文件夹简介（中文）

- `apps/`：桌面应用代码入口，放应用端实现与测试。
- `apps/desktop/`：桌面应用主目录，后续 main/renderer/shared 代码都在这里。
- `docs/`：项目文档总目录，集中管理产品、架构与外部资料。
- `docs/architecture/`：技术架构文档，记录 ADR、模块边界和 IPC 设计。
- `docs/product/`：产品设计文档，包含 IA、线框图、交互稿与发布规划。
- `docs/vendor/`：第三方厂商资料与接口参考文档。
- `plan/`：阶段计划与里程碑文档，沉淀执行路径与范围。
- `prompts/`：翻译与处理流程使用的提示词模板。
- `scripts/`：维护脚本目录，用于自动化更新与工程治理。
- `src/`：核心翻译引擎源码，包含 CLI、配置、翻译流程等。
- `src/test/`：核心能力测试用例目录。
- `src/translator/`：翻译服务适配器实现（不同 provider 的对接层）。
