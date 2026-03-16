import http from 'node:http';
import { URL } from 'node:url';
import { Logger } from './logger.js';
import { loadConfig } from './config.js';
import { runTranslation } from './service.js';
import { openInDefaultApp, openInTypora } from './typora.js';

function renderHtml(defaultPath = ''): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>mdtrans UI</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5efe6;
      --panel: rgba(255,255,255,0.82);
      --ink: #132a13;
      --muted: #5b6c5d;
      --accent: #c44900;
      --border: rgba(19,42,19,0.12);
    }
    body {
      margin: 0;
      font-family: "Avenir Next", "PingFang SC", sans-serif;
      background:
        radial-gradient(circle at top left, rgba(196,73,0,0.18), transparent 32%),
        linear-gradient(135deg, #f6f1e7, #eef6ef 58%, #e0ecff);
      color: var(--ink);
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .shell {
      width: min(860px, 100%);
      backdrop-filter: blur(18px);
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 28px;
      box-shadow: 0 28px 80px rgba(35, 54, 41, 0.16);
      overflow: hidden;
    }
    .hero {
      padding: 32px 32px 20px;
      background: linear-gradient(120deg, rgba(196,73,0,0.12), rgba(18,90,130,0.08));
    }
    .hero h1 {
      margin: 0 0 10px;
      font-size: clamp(28px, 5vw, 42px);
      letter-spacing: -0.04em;
    }
    .hero p {
      margin: 0;
      color: var(--muted);
      line-height: 1.6;
    }
    .content {
      padding: 24px 32px 32px;
      display: grid;
      gap: 18px;
    }
    label {
      font-weight: 600;
      display: grid;
      gap: 8px;
    }
    input[type="text"] {
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px 16px;
      font-size: 15px;
      background: rgba(255,255,255,0.9);
    }
    .row {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }
    button {
      border: none;
      border-radius: 999px;
      padding: 12px 18px;
      background: var(--accent);
      color: white;
      font-size: 15px;
      cursor: pointer;
    }
    button.secondary {
      background: rgba(19,42,19,0.08);
      color: var(--ink);
    }
    pre {
      margin: 0;
      padding: 18px;
      border-radius: 18px;
      min-height: 220px;
      background: #122018;
      color: #e6fce9;
      overflow: auto;
      white-space: pre-wrap;
    }
    .muted {
      color: var(--muted);
      font-size: 14px;
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <h1>mdtrans</h1>
      <p>输入一个 Markdown 文件或目录路径，生成中文副本，并可直接在 Typora 中打开。</p>
    </section>
    <section class="content">
      <label>
        文件或目录路径
        <input id="path" type="text" value="${defaultPath}" placeholder="/Users/you/project/.agents/skills" />
      </label>
      <div class="row">
        <label><input id="openAfter" type="checkbox" checked /> 翻译后在 Typora 中打开</label>
        <label><input id="force" type="checkbox" /> 强制重翻，忽略缓存</label>
      </div>
      <div class="row">
        <button id="run">开始翻译</button>
        <button id="open" class="secondary">仅在 Typora 打开路径</button>
      </div>
      <div class="muted">当前 UI 是一个本地控制台，适合快速触发翻译。更完整的拖拽桌面 UI 可在下一阶段继续扩展。</div>
      <pre id="log">等待执行…</pre>
    </section>
  </main>
  <script>
    const log = document.getElementById('log');
    const pathInput = document.getElementById('path');
    const openAfter = document.getElementById('openAfter');
    const force = document.getElementById('force');
    const write = (message) => {
      log.textContent = message;
    };

    document.getElementById('run').addEventListener('click', async () => {
      write('翻译中，请稍候...');
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: pathInput.value,
          openAfterTranslate: openAfter.checked,
          forceRetranslate: force.checked
        })
      });
      const payload = await response.json();
      write(JSON.stringify(payload, null, 2));
    });

    document.getElementById('open').addEventListener('click', async () => {
      const response = await fetch('/api/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathInput.value })
      });
      const payload = await response.json();
      write(JSON.stringify(payload, null, 2));
    });
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

export async function startUiServer(cwd: string, explicitConfigPath?: string, explicitPort?: number): Promise<void> {
  const logger = new Logger();
  const { config } = await loadConfig(cwd, explicitConfigPath);
  const port = explicitPort ?? config.uiPort;

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);

    if (request.method === 'GET' && url.pathname === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(renderHtml());
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/translate') {
      try {
        const payload = (await readRequestBody(request)) as {
          path?: string;
          openAfterTranslate?: boolean;
          forceRetranslate?: boolean;
        };
        if (!payload.path) {
          throw new Error('path is required');
        }
        const summary = await runTranslation(
          {
            pathArg: payload.path,
            cwd,
            configPath: explicitConfigPath,
            outputOverride: undefined,
            openAfterTranslate: payload.openAfterTranslate,
            forceRetranslate: payload.forceRetranslate,
          },
          logger,
        );
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify(summary, null, 2));
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
          throw new Error('path is required');
        }
        openInTypora(payload.path);
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
