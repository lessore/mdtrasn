#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_FILE="$ROOT_DIR/docs/project-structure.md"
UPDATED_AT="$(date '+%Y-%m-%d %H:%M:%S %Z')"

is_excluded_dir() {
  local p="$1"
  case "$p" in
    ".git"|".agents"|".codex"|".omx"|".mdtrans-cache"|"node_modules"|"dist")
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

describe_dir() {
  local p="$1"
  case "$p" in
    "apps") echo "桌面应用代码入口，放应用端实现与测试。" ;;
    "apps/desktop") echo "桌面应用主目录，后续 main/renderer/shared 代码都在这里。" ;;
    "docs") echo "项目文档总目录，集中管理产品、架构与外部资料。" ;;
    "docs/architecture") echo "技术架构文档，记录 ADR、模块边界和 IPC 设计。" ;;
    "docs/product") echo "产品设计文档，包含 IA、线框图、交互稿与发布规划。" ;;
    "docs/vendor") echo "第三方厂商资料与接口参考文档。" ;;
    "plan") echo "阶段计划与里程碑文档，沉淀执行路径与范围。" ;;
    "prompts") echo "翻译与处理流程使用的提示词模板。" ;;
    "scripts") echo "维护脚本目录，用于自动化更新与工程治理。" ;;
    "src") echo "核心翻译引擎源码，包含 CLI、配置、翻译流程等。" ;;
    "src/test") echo "核心能力测试用例目录。" ;;
    "src/translator") echo "翻译服务适配器实现（不同 provider 的对接层）。" ;;
    *) echo "该目录用于相关模块文件的组织与维护。" ;;
  esac
}

TREE_CONTENT="$(
  cd "$ROOT_DIR"
  echo "."

  top_dirs=()
  while IFS= read -r d; do
    top_dirs+=("$d")
  done < <(
    find . -mindepth 1 -maxdepth 1 -type d \
      | sed 's#^\./##' \
      | LC_ALL=C sort
  )

  filtered_top_dirs=()
  if [[ ${#top_dirs[@]} -gt 0 ]]; then
    for d in "${top_dirs[@]}"; do
      if [[ "$d" == .* ]]; then
        continue
      fi
      if is_excluded_dir "$d"; then
        continue
      fi
      filtered_top_dirs+=("$d")
    done
  fi

  top_count="${#filtered_top_dirs[@]}"
  for ((i = 0; i < top_count; i++)); do
    top="${filtered_top_dirs[$i]}"
    is_last_top=0
    if [[ "$i" -eq $((top_count - 1)) ]]; then
      is_last_top=1
    fi

    if [[ "$is_last_top" -eq 1 ]]; then
      echo "└── ${top}/"
      child_prefix="    "
    else
      echo "├── ${top}/"
      child_prefix="│   "
    fi

    children=()
    while IFS= read -r c; do
      children+=("$c")
    done < <(
      find "./${top}" -mindepth 1 -maxdepth 1 -type d \
        | sed "s#^\./${top}/##" \
        | LC_ALL=C sort
    )

    filtered_children=()
    if [[ ${#children[@]} -gt 0 ]]; then
      for c in "${children[@]}"; do
        if [[ "$c" == .* ]]; then
          continue
        fi
        if is_excluded_dir "$c"; then
          continue
        fi
        filtered_children+=("$c")
      done
    fi

    child_count="${#filtered_children[@]}"
    for ((j = 0; j < child_count; j++)); do
      child="${filtered_children[$j]}"
      if [[ "$j" -eq $((child_count - 1)) ]]; then
        echo "${child_prefix}└── ${child}/"
      else
        echo "${child_prefix}├── ${child}/"
      fi
    done
  done
)"

DESCRIPTIONS="$(
  cd "$ROOT_DIR"
  paths=()
  top_dirs=()
  while IFS= read -r d; do
    top_dirs+=("$d")
  done < <(
    find . -mindepth 1 -maxdepth 1 -type d \
      | sed 's#^\./##' \
      | LC_ALL=C sort
  )
  if [[ ${#top_dirs[@]} -gt 0 ]]; then
    for d in "${top_dirs[@]}"; do
      if [[ "$d" == .* ]] || is_excluded_dir "$d"; then
        continue
      fi
      paths+=("$d")
      children=()
      while IFS= read -r c; do
        children+=("$c")
      done < <(
        find "./${d}" -mindepth 1 -maxdepth 1 -type d \
          | sed "s#^\./##" \
          | LC_ALL=C sort
      )
      if [[ ${#children[@]} -gt 0 ]]; then
        for c in "${children[@]}"; do
          child_name="${c##*/}"
          if [[ "$child_name" == .* ]] || is_excluded_dir "$child_name"; then
            continue
          fi
          paths+=("$c")
        done
      fi
    done
  fi

  if [[ ${#paths[@]} -gt 0 ]]; then
    for p in "${paths[@]}"; do
      printf -- '- `%s/`：%s\n' "$p" "$(describe_dir "$p")"
    done
  fi
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

## 目录图（两级）

\`\`\`text
$TREE_CONTENT
\`\`\`

## 文件夹简介（中文）

$DESCRIPTIONS
EOF

echo "Updated: $OUTPUT_FILE"
