#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_FILE="$ROOT_DIR/docs/project-structure.md"
UPDATED_AT="$(date '+%Y-%m-%d %H:%M:%S %Z')"

TREE_CONTENT="$(
  cd "$ROOT_DIR"
  find . -maxdepth 2 \
    \( \
      -path "./.git" -o \
      -path "./node_modules" -o \
      -path "./dist" -o \
      -path "./.omx" -o \
      -path "./.agents" -o \
      -path "./.codex" -o \
      -path "./.mdtrans-cache" \
    \) -prune -o -print \
    | sed 's#^\./##' \
    | sed '/^$/d' \
    | grep -Ev '^(\.|\.DS_Store|\.env\.local|\.mdtrans-ui\.json)$' \
    | sort
)"

cat > "$OUTPUT_FILE" <<EOF
# 项目目录结构（两级）

- 生成时间：$UPDATED_AT
- 深度：2 级（仓库根目录 + 一级子项 + 二级子项）
- 说明：已排除体积较大或无须展示的目录（如 \`node_modules\`、\`.git\`、\`dist\` 等）

## 更新命令

\`\`\`bash
bash scripts/update-project-structure.sh
\`\`\`

## 目录清单

\`\`\`text
$TREE_CONTENT
\`\`\`
EOF

echo "Updated: $OUTPUT_FILE"
