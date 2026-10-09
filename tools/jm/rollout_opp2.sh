#!/usr/bin/env bash
# 铺 P0 对手立绘第二批（16 张）。与 rollout.sh 同一套自愈：任务名烧掉就加号重开，
# 已收到候选图的 tag 直接跳过，重跑不重烧积分。
# 为什么分 3 个一批：driver 的 submit 是逐条"打字→点提交→等 3.5s"，
# 一批要 15~25s，16 条一次跑不完 CLI 的 180s 硬时限（jmkit.py 文档里那句"≤3 批"就是这个）。
set -uo pipefail
cd "$(dirname "$0")" || exit 1
CLI="$LOCALAPPDATA/Tabbit/LocalAgent/bin/tabbit-cli.exe"
JM_TASK="${JM_TASK:-jmimg25}"
JOB=job_opponents2.json
LOG=incoming/rollout_opp2.log
CHUNK=3

bump_task() {
  local n=${JM_TASK##*jmimg}
  JM_TASK="jmimg$((10#${n:-0} + 1))"
  echo "  -> task name burned, bumping to $JM_TASK" >> "$LOG"
}

have_tag() {  # $1=tag : 该 tag 是否已有候选图
  ls incoming/*/"$1"_*.png >/dev/null 2>&1
}

run_stage() {  # $1=stage $2=逗号分隔 tag 列表
  local n
  for n in 1 2 3; do
    if JM_TASK="$JM_TASK" python jmkit.py "$1" "$JOB" "$2" >>"$LOG" 2>&1; then return 0; fi
    echo "[attempt $n] $1 $2 failed" >> "$LOG"
    "$CLI" finish --task "$JM_TASK" >> "$LOG" 2>&1
    bump_task
    sleep 5
  done
  return 1
}

echo "=== opp2 start $(date +%H:%M:%S) task=$JM_TASK" | tee -a "$LOG"
TAGS=$(python -c "import json;print(' '.join(b['tag'] for b in json.load(open('$JOB',encoding='utf-8'))['batches']))")
todo=""
for t in $TAGS; do
  if have_tag "$t"; then echo "=== $t skip (already collected)" | tee -a "$LOG"; else todo="$todo $t"; fi
done

n=0
list=""
for t in $todo; do
  list="$list$t"
  n=$((n + 1))
  if [ "$n" -ge "$CHUNK" ]; then
    echo "--- chunk $list $(date +%H:%M:%S)" | tee -a "$LOG"
    if run_stage submit "$list"; then sleep 100; run_stage collect "$list" || echo "!!! collect FAILED $list" | tee -a "$LOG"; else echo "!!! submit FAILED $list" | tee -a "$LOG"; fi
    list=""; n=0
  else
    list="$list,"
  fi
done
if [ -n "$list" ]; then
  echo "--- chunk $list $(date +%H:%M:%S)" | tee -a "$LOG"
  if run_stage submit "$list"; then sleep 100; run_stage collect "$list" || echo "!!! collect FAILED $list" | tee -a "$LOG"; else echo "!!! submit FAILED $list" | tee -a "$LOG"; fi
fi

echo "=== opp2 ALL DONE $(date +%H:%M:%S) task=$JM_TASK" | tee -a "$LOG"
for t in $TAGS; do have_tag "$t" || echo "  STILL MISSING $t"; done
