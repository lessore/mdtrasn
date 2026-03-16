# mdtrans

面向 `Typora + Markdown skill` 场景的本地翻译工具。它优先保证 Markdown 结构不被破坏，并生成中文副本，方便你快速阅读英文技能文件。

## 已实现能力

- 单文件翻译：输出 `foo.zh.md`
- 整目录批量翻译：输出到镜像目录 `translated-zh/`
- 只翻译自然语言，尽量保护代码块、inline code、frontmatter、URL、路径、命令、环境变量
- 本地 SQLite 缓存，重复内容不重复请求
- `--force` 强制重翻，避免旧缓存污染新 provider/新提示词验证
- glossary 术语表
- `Typora` 一键打开
- `watch` 监听重翻
- 极简本地 UI 控制台：`mdtrans ui`

## 快速开始

1. 安装依赖

```bash
npm install
```

2. 复制示例配置

```bash
cp mdtrans.config.example.json mdtrans.config.json
cp glossary.example.json glossary.json
cp .env.local.example .env.local
```

3. 设置 API Key

```bash
vim .env.local
```

`mdtrans` 会自动读取当前目录下的 `.env.local`，不会覆盖你已经手动导出的环境变量。

4. 翻译单文件

```bash
npm run build
node dist/cli.js translate .agents/skills/plan/SKILL.md --open
```

5. 翻译整个目录

```bash
node dist/cli.js translate .agents/skills
```

## 命令

```bash
mdtrans translate <path> [--config <file>] [--output <dir>] [--open] [--force]
mdtrans watch <path> [--config <file>] [--output <dir>] [--open] [--force]
mdtrans open <path>
mdtrans ui [--config <file>] [--port <number>]
```

## 配置

配置文件默认读取当前目录下的 `mdtrans.config.json`。

```json
{
  "sourceLang": "English",
  "targetLang": "Simplified Chinese",
  "outputMode": "sibling",
  "outputDir": "translated-zh",
  "translator": {
    "provider": "openai-compatible",
    "baseUrl": "https://api.openai.com/v1",
    "model": "gpt-4o-mini",
    "apiKeyEnv": "MDTRANS_API_KEY",
    "timeoutMs": 60000,
    "concurrency": 3,
    "retries": 2,
    "extraHeaders": {},
    "systemPrompt": "You are a professional Markdown translator. Translate natural language content into Simplified Chinese. Keep placeholders unchanged. Preserve Markdown structure, numbering, punctuation, code meaning, XML/HTML tag names, file paths, commands, environment variables, and API names. Return only the translated text."
  },
  "glossary": "./glossary.json",
  "ignorePatterns": [
    ".git/**",
    "node_modules/**",
    "dist/**",
    "translated-zh/**"
  ],
  "openInTypora": false,
  "uiPort": 4312
}
```

## 术语表

`glossary.json` 示例：

```json
{
  "preserve": ["Typora", "skill", "Agent", "frontmatter"],
  "translateAs": {
    "prompt": "提示词",
    "workflow": "工作流"
  }
}
```

## 说明

- 当前 UI 是一个轻量本地控制台，主要用于输入路径、查看进度、触发翻译；更完整的拖拽桌面 UI 属于下一阶段。
- `Typora` 打开依赖 macOS `open -a Typora`。如果系统里应用名不同，可手动调整 `src/typora.ts`。
- 如果你暂时还没配置在线 API，可把 `translator.provider` 改成 `"mock"`，先验证整条文件处理链路；这个模式会明确提示“仅用于演示”，不会输出真实翻译质量。
- 如果你接大模型，优先修改 `translator.systemPrompt`，把“保留 Markdown 结构、不要翻命令/路径/API 名、仅输出译文”这些约束写进去。
- 如果你接 `OpenRouter`，把 `baseUrl` 设为 `https://openrouter.ai/api/v1`，把 `model` 设为对应模型 ID，并可在 `extraHeaders` 里加 `HTTP-Referer`、`X-OpenRouter-Title`。
- 每次运行都会把摘要写到 `.mdtrans-cache/last-run.json`，便于排查失败文件、provider 和缓存行为。
- `.env.local` 已被 `.gitignore` 忽略，适合存放本地密钥；`.env.local.example` 可以提交到仓库作为模板。
