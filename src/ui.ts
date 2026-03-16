import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import { URL } from 'node:url';
import type { ConfigOverride } from './config.js';
import { loadConfig, mergeConfig } from './config.js';
import { defaultConfig } from './defaults.js';
import { writeTextFile } from './fs-utils.js';
import { Logger } from './logger.js';
import { runTranslation } from './service.js';
import { openInDefaultApp, openInTypora } from './typora.js';
import type { MdTransConfig, RunSummary } from './types.js';

const execFileAsync = promisify(execFile);
const UI_PREFS_FILE = '.mdtrans-ui.json';

type UiProvider = 'volcengine-translate' | 'openai-compatible';
type PickerKind = 'file' | 'folder';

interface UiSettings {
  provider: UiProvider;
  openInTypora: boolean;
  outputMode: 'sibling' | 'mirror-dir';
  outputDir: string;
  llm: {
    baseUrl: string;
    model: string;
    apiKey: string;
    systemPrompt: string;
  };
  volcengine: {
    region: string;
    glossaryId: string;
    projectId: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
}

interface UiStatePayload {
  cwd: string;
  defaultPath: string;
  defaultOutputPath: string;
  settings: UiSettings;
  lastRun: RunSummary | null;
  providerLabel: string;
  providerSummary: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function serializeForHtml(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026');
}

function providerLabel(provider: UiProvider): string {
  return provider === 'volcengine-translate' ? '火山引擎翻译' : '大模型翻译';
}

function providerSummary(provider: UiProvider): string {
  return provider === 'volcengine-translate'
    ? '适合批量初翻和目录级处理，速度稳定，结构保护更稳。'
    : '适合 skill、prompt、agent 这类需要更自然语气和术语处理的内容。';
}

function emptyUiSettings(): UiSettings {
  return {
    provider: 'openai-compatible',
    openInTypora: false,
    outputMode: 'sibling',
    outputDir: 'translated-zh',
    llm: {
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'openrouter/healer-alpha',
      apiKey: process.env.OPENROUTER_API_KEY ?? '',
      systemPrompt:
        defaultConfig.translator.provider === 'openai-compatible' ? (defaultConfig.translator.systemPrompt ?? '') : '',
    },
    volcengine: {
      region: 'cn-north-1',
      glossaryId: '',
      projectId: '',
      accessKeyId: process.env.VOLCENGINE_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.VOLCENGINE_SECRET_ACCESS_KEY ?? '',
    },
  };
}

function settingsFromConfig(config: MdTransConfig): UiSettings {
  const base = emptyUiSettings();
  const next: UiSettings = {
    ...base,
    openInTypora: config.openInTypora,
    outputMode: config.outputMode,
    outputDir: config.outputDir,
  };

  if (config.translator.provider === 'volcengine-translate') {
    next.provider = 'volcengine-translate';
    next.volcengine = {
      region: config.translator.region,
      glossaryId: config.translator.glossaryId ?? '',
      projectId: config.translator.projectId ?? '',
      accessKeyId: process.env[config.translator.accessKeyIdEnv] ?? '',
      secretAccessKey: process.env[config.translator.secretAccessKeyEnv] ?? '',
    };
    return next;
  }

  next.provider = 'openai-compatible';
  next.llm = {
    baseUrl: config.translator.baseUrl,
    model: config.translator.model,
    apiKey: process.env[config.translator.apiKeyEnv] ?? '',
    systemPrompt: config.translator.systemPrompt ?? '',
  };
  return next;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeUiSettings(raw: unknown, fallback: UiSettings): UiSettings {
  if (!isObject(raw)) {
    return fallback;
  }

  const llm = isObject(raw.llm) ? raw.llm : {};
  const volcengine = isObject(raw.volcengine) ? raw.volcengine : {};

  return {
    provider: raw.provider === 'volcengine-translate' ? 'volcengine-translate' : 'openai-compatible',
    openInTypora: typeof raw.openInTypora === 'boolean' ? raw.openInTypora : fallback.openInTypora,
    outputMode:
      raw.outputMode === 'mirror-dir' || raw.outputMode === 'sibling' ? raw.outputMode : fallback.outputMode,
    outputDir: typeof raw.outputDir === 'string' && raw.outputDir.trim() ? raw.outputDir.trim() : fallback.outputDir,
    llm: {
      baseUrl:
        typeof llm.baseUrl === 'string' && llm.baseUrl.trim() ? llm.baseUrl.trim() : fallback.llm.baseUrl,
      model: typeof llm.model === 'string' && llm.model.trim() ? llm.model.trim() : fallback.llm.model,
      apiKey:
        typeof llm.apiKey === 'string'
          ? llm.apiKey.trim()
          : typeof llm.apiKeyEnv === 'string' && llm.apiKeyEnv.trim().startsWith('sk-')
            ? llm.apiKeyEnv.trim()
            : fallback.llm.apiKey,
      systemPrompt:
        typeof llm.systemPrompt === 'string' ? llm.systemPrompt : fallback.llm.systemPrompt,
    },
    volcengine: {
      region:
        typeof volcengine.region === 'string' && volcengine.region.trim()
          ? volcengine.region.trim()
          : fallback.volcengine.region,
      glossaryId:
        typeof volcengine.glossaryId === 'string' ? volcengine.glossaryId.trim() : fallback.volcengine.glossaryId,
      projectId:
        typeof volcengine.projectId === 'string' ? volcengine.projectId.trim() : fallback.volcengine.projectId,
      accessKeyId:
        typeof volcengine.accessKeyId === 'string' ? volcengine.accessKeyId.trim() : fallback.volcengine.accessKeyId,
      secretAccessKey:
        typeof volcengine.secretAccessKey === 'string'
          ? volcengine.secretAccessKey.trim()
          : fallback.volcengine.secretAccessKey,
    },
  };
}

function buildConfigOverride(settings: UiSettings): ConfigOverride {
  if (settings.provider === 'volcengine-translate') {
    return {
      openInTypora: settings.openInTypora,
      outputMode: settings.outputMode,
      outputDir: settings.outputDir,
      translator: {
        provider: 'volcengine-translate',
        region: settings.volcengine.region,
        glossaryId: settings.volcengine.glossaryId || undefined,
        projectId: settings.volcengine.projectId || undefined,
      },
    };
  }

  return {
    openInTypora: settings.openInTypora,
    outputMode: settings.outputMode,
    outputDir: settings.outputDir,
    translator: {
      provider: 'openai-compatible',
      baseUrl: settings.llm.baseUrl,
      model: settings.llm.model,
      apiKeyEnv: 'OPENROUTER_API_KEY',
      systemPrompt: settings.llm.systemPrompt || undefined,
    },
  };
}

function applyRuntimeSecrets(settings: UiSettings): void {
  if (settings.llm.apiKey) {
    process.env.OPENROUTER_API_KEY = settings.llm.apiKey;
  }
  if (settings.volcengine.accessKeyId) {
    process.env.VOLCENGINE_ACCESS_KEY_ID = settings.volcengine.accessKeyId;
  }
  if (settings.volcengine.secretAccessKey) {
    process.env.VOLCENGINE_SECRET_ACCESS_KEY = settings.volcengine.secretAccessKey;
  }
}

async function readUiSettings(cwd: string): Promise<unknown> {
  const filePath = path.join(cwd, UI_PREFS_FILE);
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function writeUiSettings(cwd: string, settings: UiSettings): Promise<void> {
  const filePath = path.join(cwd, UI_PREFS_FILE);
  await writeTextFile(filePath, JSON.stringify(settings, null, 2));
}

async function readLastRunMetadata(cwd: string): Promise<RunSummary | null> {
  const metadataPath = path.join(cwd, '.mdtrans-cache', 'last-run.json');
  try {
    const raw = await readFile(metadataPath, 'utf8');
    return JSON.parse(raw) as RunSummary;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function buildUiState(cwd: string, explicitConfigPath?: string): Promise<UiStatePayload> {
  const loaded = await loadConfig(cwd, explicitConfigPath);
  const baseSettings = settingsFromConfig(loaded.config);
  const savedSettings = normalizeUiSettings(await readUiSettings(cwd), baseSettings);
  const effectiveConfig = mergeConfig(loaded.config, buildConfigOverride(savedSettings));
  const effectiveSettings = normalizeUiSettings(savedSettings, settingsFromConfig(effectiveConfig));
  applyRuntimeSecrets(effectiveSettings);
  const lastRun = await readLastRunMetadata(cwd);

  return {
    cwd,
    defaultPath: lastRun?.outputs[0]?.sourcePath ?? cwd,
    defaultOutputPath: lastRun?.outputs[0]?.outputPath ?? '',
    settings: effectiveSettings,
    lastRun,
    providerLabel: providerLabel(effectiveSettings.provider),
    providerSummary: providerSummary(effectiveSettings.provider),
  };
}

async function choosePath(kind: PickerKind): Promise<string | null> {
  const script =
    kind === 'folder'
      ? 'POSIX path of (choose folder with prompt "选择要翻译的目录" invisibles true)'
      : 'POSIX path of (choose file with prompt "选择要翻译的 Markdown 文件" invisibles true)';

  try {
    const { stdout } = await execFileAsync('osascript', ['-e', script]);
    return stdout.trim() || null;
  } catch (error) {
    const childError = error as NodeJS.ErrnoException & { stderr?: string };
    const message = `${childError.message ?? ''}\n${childError.stderr ?? ''}`;
    if (message.includes('User canceled') || message.includes('(-128)')) {
      return null;
    }
    throw error;
  }
}

function renderHtml(state: UiStatePayload): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>mdtrans Studio</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4efe7;
      --paper: rgba(255, 252, 246, 0.9);
      --paper-strong: rgba(255, 255, 255, 0.96);
      --ink: #17231d;
      --muted: #5e6c65;
      --line: rgba(23, 35, 29, 0.1);
      --accent: #b84f1f;
      --accent-deep: #8f360d;
      --accent-soft: rgba(184, 79, 31, 0.12);
      --teal: #19555c;
      --teal-soft: rgba(25, 85, 92, 0.11);
      --ok: #126245;
      --warn: #8f5600;
      --danger: #a03030;
      --radius-xl: 28px;
      --radius-lg: 20px;
      --radius-md: 14px;
      --radius-sm: 10px;
      --shadow: 0 24px 64px rgba(33, 43, 36, 0.14);
      --mono: "SFMono-Regular", "JetBrains Mono", "Menlo", monospace;
      --serif: "Iowan Old Style", "Palatino Linotype", "Songti SC", serif;
      --sans: "Avenir Next", "PingFang SC", "Hiragino Sans GB", "Segoe UI", sans-serif;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: var(--sans);
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(184, 79, 31, 0.15), transparent 28%),
        radial-gradient(circle at top right, rgba(25, 85, 92, 0.13), transparent 24%),
        linear-gradient(180deg, #f8f3ea 0%, #edf3ef 50%, #e7edf4 100%);
      padding: 24px;
    }

    button,
    input,
    textarea,
    select {
      font: inherit;
    }

    button:focus-visible,
    input:focus-visible,
    textarea:focus-visible,
    select:focus-visible,
    summary:focus-visible {
      outline: 3px solid rgba(25, 85, 92, 0.26);
      outline-offset: 3px;
    }

    .app {
      width: min(1240px, 100%);
      margin: 0 auto;
      display: grid;
      gap: 18px;
    }

    .hero,
    .panel {
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow);
      backdrop-filter: blur(16px);
    }

    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
      gap: 18px;
      overflow: hidden;
      min-width: 0;
    }

    .hero-copy {
      padding: 28px 30px;
      position: relative;
      isolation: isolate;
      min-width: 0;
    }

    .hero-copy::after {
      content: "";
      position: absolute;
      inset: auto -12% -38% 20%;
      height: 220px;
      background: radial-gradient(circle, rgba(184, 79, 31, 0.18), transparent 64%);
      z-index: -1;
    }

    .hero-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.78);
      border: 1px solid rgba(23, 35, 29, 0.08);
      color: var(--muted);
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    h1 {
      margin: 18px 0 14px;
      font-family: var(--serif);
      font-size: clamp(34px, 5vw, 58px);
      line-height: 0.96;
      letter-spacing: -0.05em;
    }

    .lede {
      margin: 0;
      max-width: 60ch;
      color: var(--muted);
      font-size: 16px;
      line-height: 1.7;
    }

    .hero-points {
      margin-top: 22px;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }

    .point {
      padding: 14px 16px;
      border-radius: var(--radius-md);
      background: rgba(255, 255, 255, 0.62);
      border: 1px solid rgba(23, 35, 29, 0.08);
    }

    .point strong {
      display: block;
      font-size: 13px;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
    }

    .point span {
      display: block;
      line-height: 1.6;
    }

    .hero-side {
      padding: 24px;
      display: grid;
      gap: 14px;
      align-content: start;
      min-width: 0;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.86), rgba(255, 252, 246, 0.96)),
        linear-gradient(135deg, rgba(184, 79, 31, 0.06), rgba(25, 85, 92, 0.06));
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      font-weight: 700;
      font-size: 13px;
      background: rgba(23, 35, 29, 0.08);
      color: var(--muted);
    }

    .status-pill[data-tone="loading"] {
      background: var(--teal-soft);
      color: var(--teal);
    }

    .status-pill[data-tone="ok"] {
      background: rgba(18, 98, 69, 0.13);
      color: var(--ok);
    }

    .status-pill[data-tone="warn"] {
      background: rgba(143, 86, 0, 0.13);
      color: var(--warn);
    }

    .status-pill[data-tone="error"] {
      background: rgba(160, 48, 48, 0.12);
      color: var(--danger);
    }

    .hero-side h2,
    .panel h2 {
      margin: 0;
      font-size: 18px;
      letter-spacing: -0.02em;
    }

    .subtle {
      color: var(--muted);
      font-size: 14px;
      line-height: 1.65;
    }

    .summary-card {
      padding: 14px 16px;
      border-radius: var(--radius-md);
      background: rgba(255, 255, 255, 0.66);
      border: 1px solid rgba(23, 35, 29, 0.08);
    }

    .summary-card strong {
      display: block;
      margin-bottom: 8px;
      overflow-wrap: anywhere;
    }

    .grid {
      display: grid;
      grid-template-columns: minmax(0, 1.05fr) minmax(320px, 0.95fr);
      gap: 18px;
    }

    .stack {
      display: grid;
      gap: 18px;
      min-width: 0;
    }

    .panel {
      padding: 22px;
      min-width: 0;
    }

    .panel-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 16px;
    }

    .field {
      display: grid;
      gap: 8px;
      margin-bottom: 14px;
    }

    .field:last-child {
      margin-bottom: 0;
    }

    .field label {
      font-size: 13px;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--muted);
    }

    input[type="text"],
    textarea,
    select {
      width: 100%;
      max-width: 100%;
      border: 1px solid rgba(23, 35, 29, 0.12);
      border-radius: 16px;
      padding: 14px 16px;
      background: var(--paper-strong);
      color: var(--ink);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.82);
      min-width: 0;
    }

    textarea {
      min-height: 120px;
      resize: vertical;
      line-height: 1.6;
    }

    .path-row,
    .action-row,
    .toggle-row,
    .picker-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }

    .path-row input {
      flex: 1;
      min-width: 240px;
    }

    .btn {
      appearance: none;
      border: none;
      border-radius: 999px;
      padding: 12px 18px;
      cursor: pointer;
      transition: transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease;
    }

    .btn:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 10px 24px rgba(23, 35, 29, 0.12);
    }

    .btn:disabled {
      cursor: progress;
      opacity: 0.7;
    }

    .btn-primary {
      background: linear-gradient(135deg, var(--accent), var(--accent-deep));
      color: white;
      font-weight: 700;
    }

    .btn-secondary {
      background: rgba(23, 35, 29, 0.08);
      color: var(--ink);
      font-weight: 600;
    }

    .toggle {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--ink);
      font-size: 14px;
    }

    .toggle input {
      inline-size: 16px;
      block-size: 16px;
      accent-color: var(--accent);
    }

    .segmented {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .segment {
      appearance: none;
      border: 1px solid rgba(23, 35, 29, 0.08);
      border-radius: 18px;
      padding: 16px;
      background: rgba(255, 255, 255, 0.66);
      cursor: pointer;
      text-align: left;
    }

    .segment[data-active="true"] {
      border-color: rgba(184, 79, 31, 0.26);
      background: linear-gradient(135deg, rgba(184, 79, 31, 0.14), rgba(255, 255, 255, 0.82));
      box-shadow: inset 0 0 0 1px rgba(184, 79, 31, 0.08);
    }

    .segment strong {
      display: block;
      margin-bottom: 6px;
    }

    .segment span {
      display: block;
      color: var(--muted);
      line-height: 1.6;
      font-size: 14px;
    }

    .provider-fields[hidden] {
      display: none;
    }

    .advanced {
      border: 1px solid rgba(23, 35, 29, 0.08);
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.6);
      overflow: hidden;
    }

    .advanced-toggle {
      appearance: none;
      width: 100%;
      border: none;
      background: transparent;
      cursor: pointer;
      padding: 16px 18px;
      font-weight: 700;
      text-align: left;
      color: var(--ink);
    }

    .advanced-toggle::after {
      content: attr(data-label);
      float: right;
      color: var(--muted);
      font-weight: 600;
    }

    .advanced-body {
      padding: 0 18px 18px;
      display: grid;
      gap: 14px;
    }

    .advanced-body[hidden] {
      display: none;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }

    .stat {
      padding: 14px 16px;
      border-radius: var(--radius-md);
      background: rgba(255, 255, 255, 0.66);
      border: 1px solid rgba(23, 35, 29, 0.08);
    }

    .stat strong {
      display: block;
      font-size: 28px;
      letter-spacing: -0.04em;
      margin-bottom: 6px;
    }

    .stat span {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }

    .result-list,
    .warning-list {
      display: grid;
      gap: 10px;
    }

    .result-item,
    .warning-item,
    .empty {
      padding: 14px 16px;
      border-radius: var(--radius-md);
      background: rgba(255, 255, 255, 0.66);
      border: 1px solid rgba(23, 35, 29, 0.08);
    }

    .warning-item {
      background: rgba(160, 48, 48, 0.06);
      border-color: rgba(160, 48, 48, 0.14);
    }

    .result-item strong,
    .warning-item strong {
      display: block;
      margin-bottom: 8px;
      word-break: break-word;
    }

    .result-item span,
    .warning-item span,
    .empty {
      display: block;
      color: var(--muted);
      line-height: 1.65;
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    .path {
      font-family: var(--mono);
    }

    .micro {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.6;
    }

    @media (max-width: 1080px) {
      .hero,
      .grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 760px) {
      body {
        padding: 16px;
      }

      .hero-copy,
      .hero-side,
      .panel {
        padding: 18px;
      }

      .hero-points,
      .stats,
      .segmented {
        grid-template-columns: 1fr;
      }

      .action-row .btn,
      .picker-row .btn {
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <main class="app">
    <section class="hero">
      <div class="hero-copy">
        <span class="hero-badge">mdtrans studio</span>
        <h1>直接选文件，选翻译方式，然后开始用。</h1>
        <p class="lede">
          这版页面把真正需要的动作收到了前面：选一个 Markdown 文件或目录，选择火山引擎或大模型，然后开始翻译。
          不需要再手改配置文件，也不需要先理解工具内部实现。
        </p>
        <div class="hero-points">
          <div class="point">
            <strong>Source</strong>
            <span>文件和目录都能点选，不再只靠手输路径。</span>
          </div>
          <div class="point">
            <strong>Engine</strong>
            <span>直接切换火山引擎或大模型，页面里就能保存选择。</span>
          </div>
          <div class="point">
            <strong>Output</strong>
            <span>翻完后立刻查看结果，适合连续读 skill 文档。</span>
          </div>
        </div>
      </div>

      <aside class="hero-side">
        <div id="statusPill" class="status-pill" data-tone="idle">待命</div>
        <div>
          <h2 id="statusTitle">等待开始</h2>
          <p id="statusBody" class="subtle">先选一个文件或目录。默认会加载你上一次保存的翻译设置。</p>
        </div>
        <div class="summary-card">
          <strong id="providerLabel">${escapeHtml(state.providerLabel)}</strong>
          <div id="providerSummary" class="subtle">${escapeHtml(state.providerSummary)}</div>
        </div>
        <div class="summary-card">
          <strong>上次打开路径</strong>
          <div id="defaultPath" class="micro path">${escapeHtml(state.defaultPath)}</div>
        </div>
        <div class="summary-card">
          <strong>最近输出位置</strong>
          <div id="defaultOutputPath" class="micro path">${escapeHtml(state.defaultOutputPath || '自动生成')}</div>
        </div>
      </aside>
    </section>

    <section class="grid">
      <div class="stack">
        <section class="panel">
          <div class="panel-head">
            <div>
              <h2>1. 选择内容</h2>
              <div class="subtle">支持单文件和整目录。你可以手输路径，也可以直接点按钮选择。</div>
            </div>
          </div>

          <div class="field">
            <label for="pathInput">文件或目录路径</label>
            <div class="path-row">
              <input id="pathInput" type="text" value="${escapeHtml(state.defaultPath)}" spellcheck="false" />
            </div>
            <div class="picker-row">
              <button id="pickFileButton" class="btn btn-secondary" type="button">选择文件</button>
              <button id="pickFolderButton" class="btn btn-secondary" type="button">选择目录</button>
              <button id="openCurrentButton" class="btn btn-secondary" type="button">在 Typora 中打开当前路径</button>
            </div>
          </div>

          <div class="field">
            <label for="outputPathInput">输出路径（可选）</label>
            <div class="path-row">
              <input id="outputPathInput" type="text" value="" spellcheck="false" placeholder="留空时按默认规则自动生成" />
            </div>
            <div class="picker-row">
              <button id="pickOutputButton" class="btn btn-secondary" type="button">选择输出目录</button>
              <span class="micro">单文件可填具体输出文件，目录翻译可选输出目录；留空则自动生成。</span>
            </div>
          </div>

          <div class="action-row">
            <button id="runButton" class="btn btn-primary" type="button">开始翻译</button>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <div>
              <h2>2. 选择翻译方式</h2>
              <div class="subtle">默认只保留最关键的切换项。更细的设置都收在高级设置里。</div>
            </div>
          </div>

          <div class="segmented">
            <button id="providerVolc" class="segment" type="button" data-provider="volcengine-translate">
              <strong>火山引擎翻译</strong>
              <span>适合批量翻译和目录处理，稳定、直接。</span>
            </button>
            <button id="providerLlm" class="segment" type="button" data-provider="openai-compatible">
              <strong>大模型翻译</strong>
              <span>更适合 skill、prompt、agent 内容的中文表达。</span>
            </button>
          </div>

          <div id="llmFields" class="provider-fields" style="margin-top: 16px;">
            <div class="field">
              <label for="llmModelInput">模型</label>
              <input id="llmModelInput" type="text" />
            </div>
            <div class="field">
              <label for="llmBaseUrlInput">接口地址</label>
              <input id="llmBaseUrlInput" type="text" />
            </div>
            <div class="field">
              <label for="llmApiKeyInput">API Key</label>
              <input id="llmApiKeyInput" type="password" autocomplete="off" />
            </div>
          </div>

          <div id="volcFields" class="provider-fields" style="margin-top: 16px;">
            <div class="micro">火山引擎模式会直接使用本地已配置的访问密钥，只需要在这里保留区域和可选术语库配置。</div>
          </div>

          <div class="advanced" style="margin-top: 16px;">
            <button id="advancedToggle" class="advanced-toggle" type="button" data-label="展开">高级设置</button>
            <div id="advancedBody" class="advanced-body" hidden>
              <div class="toggle-row">
                <label class="toggle"><input id="openAfterToggle" type="checkbox" /> 翻译后自动在 Typora 打开</label>
                <label class="toggle"><input id="forceToggle" type="checkbox" /> 本次强制重翻</label>
              </div>

              <div class="field">
                <label for="outputModeSelect">目录翻译输出方式</label>
                <select id="outputModeSelect">
                  <option value="sibling">同目录生成 .zh.md 副本</option>
                  <option value="mirror-dir">输出到镜像目录</option>
                </select>
              </div>

              <div class="field">
                <label for="outputDirInput">镜像目录名称</label>
                <input id="outputDirInput" type="text" />
              </div>

              <div class="field">
                <label for="llmPromptInput">大模型翻译提示词</label>
                <textarea id="llmPromptInput"></textarea>
              </div>

              <div class="field">
                <label for="volcRegionInput">火山引擎 Region</label>
                <input id="volcRegionInput" type="text" />
              </div>

              <div class="field">
                <label for="volcGlossaryInput">火山术语库 ID（可选）</label>
                <input id="volcGlossaryInput" type="text" />
              </div>

              <div class="field">
                <label for="volcProjectInput">火山项目 ID（可选）</label>
                <input id="volcProjectInput" type="text" />
              </div>

              <div class="field">
                <label for="volcAccessKeyInput">火山 Access Key ID</label>
                <input id="volcAccessKeyInput" type="password" autocomplete="off" />
              </div>

              <div class="field">
                <label for="volcSecretKeyInput">火山 Secret Access Key</label>
                <input id="volcSecretKeyInput" type="password" autocomplete="off" />
              </div>
            </div>
          </div>

          <div class="action-row" style="margin-top: 16px;">
            <button id="saveSettingsButton" class="btn btn-secondary" type="button">保存设置</button>
          </div>
        </section>
      </div>

      <div class="stack">
        <section class="panel">
          <div class="panel-head">
            <div>
              <h2>3. 查看结果</h2>
              <div class="subtle">页面只显示你真正会用到的结果：这次有没有成功、输出在哪、需不需要重试。</div>
            </div>
          </div>

          <div class="stats">
            <div class="stat">
              <strong id="translatedCount">0</strong>
              <span>新增翻译段落</span>
            </div>
            <div class="stat">
              <strong id="cachedCount">0</strong>
              <span>缓存命中</span>
            </div>
            <div class="stat">
              <strong id="failureCount">0</strong>
              <span>失败文件数</span>
            </div>
          </div>

          <div style="margin-top: 16px;">
            <div id="resultList"></div>
          </div>

          <div class="action-row" style="margin-top: 16px;">
            <button id="openLastOutputButton" class="btn btn-secondary" type="button">打开最近输出</button>
            <button id="refreshButton" class="btn btn-secondary" type="button">刷新页面状态</button>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <div>
              <h2>问题提示</h2>
              <div class="subtle">只有真的需要你注意的内容才会出现在这里。</div>
            </div>
          </div>
          <div id="warningList"></div>
        </section>
      </div>
    </section>
  </main>

  <script>
    const boot = ${serializeForHtml(state)};
    const state = {
      view: boot,
      activeRun: boot.lastRun,
      busy: false
    };

    const refs = {
      statusPill: document.getElementById('statusPill'),
      statusTitle: document.getElementById('statusTitle'),
      statusBody: document.getElementById('statusBody'),
      providerLabel: document.getElementById('providerLabel'),
      providerSummary: document.getElementById('providerSummary'),
      defaultPath: document.getElementById('defaultPath'),
      defaultOutputPath: document.getElementById('defaultOutputPath'),
      pathInput: document.getElementById('pathInput'),
      outputPathInput: document.getElementById('outputPathInput'),
      pickFileButton: document.getElementById('pickFileButton'),
      pickFolderButton: document.getElementById('pickFolderButton'),
      pickOutputButton: document.getElementById('pickOutputButton'),
      openCurrentButton: document.getElementById('openCurrentButton'),
      providerVolc: document.getElementById('providerVolc'),
      providerLlm: document.getElementById('providerLlm'),
      llmFields: document.getElementById('llmFields'),
      volcFields: document.getElementById('volcFields'),
      advancedToggle: document.getElementById('advancedToggle'),
      advancedBody: document.getElementById('advancedBody'),
      llmModelInput: document.getElementById('llmModelInput'),
      llmBaseUrlInput: document.getElementById('llmBaseUrlInput'),
      llmApiKeyInput: document.getElementById('llmApiKeyInput'),
      llmPromptInput: document.getElementById('llmPromptInput'),
      volcRegionInput: document.getElementById('volcRegionInput'),
      volcGlossaryInput: document.getElementById('volcGlossaryInput'),
      volcProjectInput: document.getElementById('volcProjectInput'),
      volcAccessKeyInput: document.getElementById('volcAccessKeyInput'),
      volcSecretKeyInput: document.getElementById('volcSecretKeyInput'),
      outputModeSelect: document.getElementById('outputModeSelect'),
      outputDirInput: document.getElementById('outputDirInput'),
      openAfterToggle: document.getElementById('openAfterToggle'),
      forceToggle: document.getElementById('forceToggle'),
      saveSettingsButton: document.getElementById('saveSettingsButton'),
      runButton: document.getElementById('runButton'),
      refreshButton: document.getElementById('refreshButton'),
      openLastOutputButton: document.getElementById('openLastOutputButton'),
      translatedCount: document.getElementById('translatedCount'),
      cachedCount: document.getElementById('cachedCount'),
      failureCount: document.getElementById('failureCount'),
      resultList: document.getElementById('resultList'),
      warningList: document.getElementById('warningList')
    };

    function escapeHtml(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    function formatNumber(value) {
      return new Intl.NumberFormat('zh-CN').format(value || 0);
    }

    function relativePath(value) {
      if (!value) {
        return '暂无';
      }
      const cwd = state.view.cwd.replace(/[.*+?^$()|[\\]\\\\]/g, '\\\\$&');
      return String(value).replace(new RegExp('^' + cwd + '/?'), './');
    }

    function currentRun() {
      return state.activeRun || state.view.lastRun;
    }

    function currentSettingsFromForm() {
      return {
        provider: refs.providerVolc.dataset.active === 'true' ? 'volcengine-translate' : 'openai-compatible',
        openInTypora: refs.openAfterToggle.checked,
        outputMode: refs.outputModeSelect.value,
        outputDir: refs.outputDirInput.value.trim() || 'translated-zh',
        llm: {
          baseUrl: refs.llmBaseUrlInput.value.trim(),
          model: refs.llmModelInput.value.trim(),
          apiKey: refs.llmApiKeyInput.value.trim(),
          systemPrompt: refs.llmPromptInput.value
        },
        volcengine: {
          region: refs.volcRegionInput.value.trim() || 'cn-north-1',
          glossaryId: refs.volcGlossaryInput.value.trim(),
          projectId: refs.volcProjectInput.value.trim(),
          accessKeyId: refs.volcAccessKeyInput.value.trim(),
          secretAccessKey: refs.volcSecretKeyInput.value.trim()
        }
      };
    }

    function applySettingsToForm(settings) {
      const isVolc = settings.provider === 'volcengine-translate';
      refs.providerVolc.dataset.active = String(isVolc);
      refs.providerLlm.dataset.active = String(!isVolc);
      refs.llmFields.hidden = isVolc;
      refs.volcFields.hidden = !isVolc;
      refs.openAfterToggle.checked = settings.openInTypora;
      refs.outputModeSelect.value = settings.outputMode;
      refs.outputDirInput.value = settings.outputDir;
      refs.llmModelInput.value = settings.llm.model;
      refs.llmBaseUrlInput.value = settings.llm.baseUrl;
      refs.llmApiKeyInput.value = settings.llm.apiKey;
      refs.llmPromptInput.value = settings.llm.systemPrompt;
      refs.volcRegionInput.value = settings.volcengine.region;
      refs.volcGlossaryInput.value = settings.volcengine.glossaryId;
      refs.volcProjectInput.value = settings.volcengine.projectId;
      refs.volcAccessKeyInput.value = settings.volcengine.accessKeyId;
      refs.volcSecretKeyInput.value = settings.volcengine.secretAccessKey;
      refs.providerLabel.textContent = isVolc ? '火山引擎翻译' : '大模型翻译';
      refs.providerSummary.textContent = isVolc
        ? '适合批量初翻和目录级处理，速度稳定，结构保护更稳。'
        : '适合 skill、prompt、agent 这类需要更自然语气和术语处理的内容。';
    }

    function setBusy(isBusy) {
      state.busy = isBusy;
      [
        refs.pickFileButton,
        refs.pickFolderButton,
        refs.pickOutputButton,
        refs.openCurrentButton,
        refs.saveSettingsButton,
        refs.runButton,
        refs.refreshButton,
        refs.openLastOutputButton
      ].forEach((button) => {
        button.disabled = isBusy;
      });
      refs.pathInput.disabled = isBusy;
      refs.outputPathInput.disabled = isBusy;
      refs.forceToggle.disabled = isBusy;
      refs.openAfterToggle.disabled = isBusy;
      refs.outputModeSelect.disabled = isBusy;
      refs.outputDirInput.disabled = isBusy;
      refs.llmModelInput.disabled = isBusy;
      refs.llmBaseUrlInput.disabled = isBusy;
      refs.llmApiKeyInput.disabled = isBusy;
      refs.llmPromptInput.disabled = isBusy;
      refs.volcRegionInput.disabled = isBusy;
      refs.volcGlossaryInput.disabled = isBusy;
      refs.volcProjectInput.disabled = isBusy;
      refs.volcAccessKeyInput.disabled = isBusy;
      refs.volcSecretKeyInput.disabled = isBusy;
      refs.runButton.textContent = isBusy ? '处理中…' : '开始翻译';
    }

    function setStatus(tone, title, body) {
      refs.statusPill.dataset.tone = tone;
      refs.statusPill.textContent =
        tone === 'loading' ? '进行中' :
        tone === 'ok' ? '已完成' :
        tone === 'warn' ? '需留意' :
        tone === 'error' ? '出错' : '待命';
      refs.statusTitle.textContent = title;
      refs.statusBody.textContent = body;
    }

    function renderResults() {
      const run = currentRun();
      refs.translatedCount.textContent = formatNumber(run ? run.translatedSegments : 0);
      refs.cachedCount.textContent = formatNumber(run ? run.cachedSegments : 0);
      refs.failureCount.textContent = formatNumber(run ? run.failures.length : 0);

      if (!run || run.outputs.length === 0) {
        refs.resultList.innerHTML = '<div class="empty">还没有翻译结果。选好路径和翻译方式后，点一次“开始翻译”就会出现在这里。</div>';
      } else {
        refs.resultList.innerHTML = '<div class="result-list">' + run.outputs.map((item) => (
          '<div class="result-item">' +
          '<strong class="path">' + escapeHtml(relativePath(item.outputPath)) + '</strong>' +
          '<span>源文件：<span class="path">' + escapeHtml(relativePath(item.sourcePath)) + '</span></span>' +
          '<span>' + escapeHtml(item.copied ? '复制资源文件' : '生成中文译文') + '</span>' +
          '</div>'
        )).join('') + '</div>';
      }

      const warnings = [];
      if (run) {
        warnings.push(...(run.warnings || []));
        run.failures.forEach((failure) => {
          warnings.push(relativePath(failure.sourcePath) + '：' + failure.message);
        });
      }

      if (warnings.length === 0) {
        refs.warningList.innerHTML = '<div class="empty">当前没有需要你处理的问题。页面会尽量只在真的有异常时提醒你。</div>';
      } else {
        refs.warningList.innerHTML = '<div class="warning-list">' + warnings.map((warning) => (
          '<div class="warning-item"><strong>注意</strong><span>' + escapeHtml(warning) + '</span></div>'
        )).join('') + '</div>';
      }
    }

    async function refreshState() {
      const response = await fetch('/api/state');
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || '刷新状态失败');
      }
      state.view = payload;
      state.activeRun = payload.lastRun;
      refs.defaultPath.textContent = payload.defaultPath;
      refs.defaultOutputPath.textContent = payload.defaultOutputPath || '自动生成';
      if (!refs.pathInput.value.trim()) {
        refs.pathInput.value = payload.defaultPath;
      }
      applySettingsToForm(payload.settings);
      renderResults();
    }

    async function saveSettingsOnly() {
      const response = await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: currentSettingsFromForm() })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || '保存设置失败');
      }
      state.view = payload;
      applySettingsToForm(payload.settings);
      return payload;
    }

    async function handlePick(kind) {
      setBusy(true);
      setStatus('loading', kind === 'folder' ? '正在选择目录' : '正在选择文件', '系统会弹出原生选择框。');
      try {
        const response = await fetch('/api/pick-path', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind })
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || '路径选择失败');
        }
        if (payload.path) {
          refs.pathInput.value = payload.path;
          setStatus('ok', '路径已选好', '现在可以直接开始翻译，或者先切换翻译方式。');
        } else {
          setStatus('idle', '未选择路径', '你刚才取消了系统选择框，没有关系，随时可以再选一次。');
        }
      } catch (error) {
        setStatus('error', '路径选择失败', error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    }

    async function handlePickOutput() {
      setBusy(true);
      setStatus('loading', '正在选择输出目录', '选一个目录后，工具会把译文写到这里；如果留空则继续按默认规则输出。');
      try {
        const response = await fetch('/api/pick-path', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'folder' })
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || '输出目录选择失败');
        }
        if (payload.path) {
          refs.outputPathInput.value = payload.path;
          setStatus('ok', '输出位置已选好', '现在可以直接开始翻译。');
        } else {
          setStatus('idle', '未修改输出位置', '你刚才取消了输出目录选择，工具会继续使用默认输出规则。');
        }
      } catch (error) {
        setStatus('error', '输出目录选择失败', error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    }

    async function handleRun() {
      const targetPath = refs.pathInput.value.trim();
      if (!targetPath) {
        setStatus('warn', '还没选路径', '先选一个文件或目录，再开始翻译。');
        refs.pathInput.focus();
        return;
      }

      setBusy(true);
      setStatus('loading', '正在翻译', '工具正在解析 Markdown、保护代码块和路径，并按你当前选择的方式执行翻译。');

      try {
        const response = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: targetPath,
            outputOverride: refs.outputPathInput.value.trim() || undefined,
            settings: currentSettingsFromForm(),
            forceRetranslate: refs.forceToggle.checked
          })
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || '翻译失败');
        }
        state.activeRun = payload.summary;
        state.view = payload.state;
        applySettingsToForm(payload.state.settings);
        renderResults();
        const failureCount = payload.summary.failures.length;
        setStatus(
          failureCount > 0 ? 'warn' : 'ok',
          failureCount > 0 ? '翻译完成，但有少量问题' : '翻译完成',
          '已输出 ' + formatNumber(payload.summary.outputs.length) + ' 个结果。'
        );
      } catch (error) {
        setStatus('error', '翻译失败', error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    }

    async function openPath(targetPath, emptyMessage) {
      if (!targetPath) {
        setStatus('warn', '没有可打开的路径', emptyMessage);
        return;
      }
      setBusy(true);
      setStatus('loading', '正在打开', '正在调用 Typora 打开目标。');
      try {
        const response = await fetch('/api/open', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: targetPath })
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || '打开失败');
        }
        setStatus('ok', '已尝试打开', '如果目标路径存在，Typora 会显示对应文件或目录。');
      } catch (error) {
        setStatus('error', '打开失败', error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    }

    refs.providerVolc.addEventListener('click', () => {
      const settings = currentSettingsFromForm();
      settings.provider = 'volcengine-translate';
      applySettingsToForm(settings);
    });

    refs.providerLlm.addEventListener('click', () => {
      const settings = currentSettingsFromForm();
      settings.provider = 'openai-compatible';
      applySettingsToForm(settings);
    });

    refs.advancedToggle.addEventListener('click', () => {
      const nextHidden = !refs.advancedBody.hidden;
      refs.advancedBody.hidden = nextHidden;
      refs.advancedToggle.dataset.label = nextHidden ? '展开' : '收起';
    });

    refs.pickFileButton.addEventListener('click', () => handlePick('file'));
    refs.pickFolderButton.addEventListener('click', () => handlePick('folder'));
    refs.pickOutputButton.addEventListener('click', handlePickOutput);
    refs.openCurrentButton.addEventListener('click', () => openPath(refs.pathInput.value.trim(), '先选一个文件或目录。'));
    refs.openLastOutputButton.addEventListener('click', () => {
      const run = currentRun();
      openPath(run && run.outputs[0] ? run.outputs[0].outputPath : '', '先执行一次翻译，页面才知道最近的输出在哪。');
    });

    refs.saveSettingsButton.addEventListener('click', async () => {
      setBusy(true);
      setStatus('loading', '正在保存设置', '页面会记住你当前选择的翻译方式和相关参数。');
      try {
        const payload = await saveSettingsOnly();
        refs.defaultPath.textContent = payload.defaultPath;
        setStatus('ok', '设置已保存', '下次打开页面时，会默认恢复这些翻译设置。');
      } catch (error) {
        setStatus('error', '保存失败', error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    });

    refs.runButton.addEventListener('click', handleRun);
    refs.refreshButton.addEventListener('click', async () => {
      setBusy(true);
      setStatus('loading', '正在刷新', '正在重新读取页面设置和最近一次运行结果。');
      try {
        await refreshState();
        setStatus('ok', '已刷新', '页面状态已经同步。');
      } catch (error) {
        setStatus('error', '刷新失败', error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    });

    applySettingsToForm(boot.settings);
    renderResults();
  </script>
</body>
</html>`;
}

async function readRequestBody(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function resolveUiPath(cwd: string, targetPath: string): string {
  return path.resolve(cwd, targetPath);
}

export async function startUiServer(cwd: string, explicitConfigPath?: string, explicitPort?: number): Promise<void> {
  const logger = new Logger();
  const loaded = await loadConfig(cwd, explicitConfigPath);
  const port = explicitPort ?? loaded.config.uiPort;

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);

    if (request.method === 'GET' && url.pathname === '/') {
      const state = await buildUiState(cwd, explicitConfigPath);
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(renderHtml(state));
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/state') {
      try {
        const state = await buildUiState(cwd, explicitConfigPath);
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify(state, null, 2));
      } catch (error) {
        response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: (error as Error).message }, null, 2));
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/preferences') {
      try {
        const payload = (await readRequestBody(request)) as { settings?: unknown };
        const currentState = await buildUiState(cwd, explicitConfigPath);
        const settings = normalizeUiSettings(payload.settings, currentState.settings);
        await writeUiSettings(cwd, settings);
        applyRuntimeSecrets(settings);
        const nextState = await buildUiState(cwd, explicitConfigPath);
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify(nextState, null, 2));
      } catch (error) {
        response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: (error as Error).message }, null, 2));
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/pick-path') {
      try {
        const payload = (await readRequestBody(request)) as { kind?: PickerKind };
        const picked = await choosePath(payload.kind === 'folder' ? 'folder' : 'file');
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ path: picked }, null, 2));
      } catch (error) {
        response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: (error as Error).message }, null, 2));
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/translate') {
      try {
        const payload = (await readRequestBody(request)) as {
          path?: string;
          outputOverride?: string;
          settings?: unknown;
          forceRetranslate?: boolean;
        };

        if (!payload.path) {
          response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify({ error: 'path is required' }, null, 2));
          return;
        }

        const currentState = await buildUiState(cwd, explicitConfigPath);
        const settings = normalizeUiSettings(payload.settings, currentState.settings);
        await writeUiSettings(cwd, settings);
        applyRuntimeSecrets(settings);

        const summary = await runTranslation(
          {
            pathArg: payload.path,
            cwd,
            configPath: explicitConfigPath,
            outputOverride: payload.outputOverride,
            openAfterTranslate: settings.openInTypora,
            forceRetranslate: payload.forceRetranslate,
            configOverride: buildConfigOverride(settings),
          },
          logger,
        );

        const nextState = await buildUiState(cwd, explicitConfigPath);
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ summary, state: nextState }, null, 2));
      } catch (error) {
        response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: (error as Error).message }, null, 2));
      }
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/open') {
      try {
        const payload = (await readRequestBody(request)) as { path?: string };
        if (!payload.path) {
          response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify({ error: 'path is required' }, null, 2));
          return;
        }
        openInTypora(resolveUiPath(cwd, payload.path));
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ ok: true }, null, 2));
      } catch (error) {
        response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify({ error: (error as Error).message }, null, 2));
      }
      return;
    }

    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  });

  await new Promise<void>((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve());
  });

  logger.info(`UI 已启动：http://127.0.0.1:${port}`);
  openInDefaultApp(`http://127.0.0.1:${port}`);
}
