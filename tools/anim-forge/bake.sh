#!/usr/bin/env bash
# 一键烘焙：Godot 渲帧 -> Pillow 编无缝 animated webp -> 落到游戏资产目录
# 用法：bash tools/anim-forge/bake.sh tools/anim-forge/jobs/cj_start.json [job2.json ...]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
GODOT="${GODOT_EXE:-/e/godot/Godot_v4.7.2-stable_win64_console.exe}"
KEEP="${KEEP:-0}"

if [ $# -eq 0 ]; then
  echo "usage: bake.sh <job.json> [more jobs...]" >&2
  exit 2
fi

for JOB in "$@"; do
  case "$JOB" in
    /*) JOB_ABS="$JOB" ;;
    *) JOB_ABS="$ROOT/$JOB" ;;
  esac
  NAME="$(basename "$JOB_ABS" .json)"
  OUTDIR="$HERE/out/$NAME"
  rm -rf "$OUTDIR"; mkdir -p "$OUTDIR"

  FPS="$(python -c "import json,sys;print(json.load(open(sys.argv[1],encoding='utf-8')).get('fps',20))" "$JOB_ABS")"
  echo "=== bake $NAME (fps=$FPS) ==="
  "$GODOT" --path "$HERE" -s res://forge.gd --fixed-fps "$FPS" \
    -- --manifest "$JOB_ABS" --frames "$OUTDIR" 2>&1 \
    | grep -E "forge:|SCRIPT ERROR|Cannot|no such source" || true

  python "$HERE/forge.py" --job "$JOB_ABS" --frames "$OUTDIR" \
    --out "$ROOT/$(python -c "import json,sys;print(json.load(open(sys.argv[1],encoding='utf-8'))['deliver']['out'])" "$JOB_ABS")" \
    --width "$(python -c "import json,sys;print(json.load(open(sys.argv[1],encoding='utf-8'))['deliver'].get('width',0))" "$JOB_ABS")" \
    --height "$(python -c "import json,sys;print(json.load(open(sys.argv[1],encoding='utf-8'))['deliver'].get('height',0))" "$JOB_ABS")" \
    --quality "$(python -c "import json,sys;print(json.load(open(sys.argv[1],encoding='utf-8')).get('deliver',{}).get('quality',72))" "$JOB_ABS")"

  if [ "$KEEP" = "0" ]; then rm -rf "$OUTDIR"; fi
done
