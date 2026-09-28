#!/usr/bin/env bash
# 串行铺场景背景：每个 job 提交 -> 等出图 -> 回收。
# 两条自愈：
#   1) 任务名会烧掉（context 关闭后 tabbit 永久不认旧名）——失败即加号重开，仍是一浏览器一页。
#   2) 已收到图的 job 直接跳过，重跑不重烧积分。
set -uo pipefail
cd "$(dirname "$0")" || exit 1
CLI="$LOCALAPPDATA/Tabbit/LocalAgent/bin/tabbit-cli.exe"
JM_TASK="${JM_TASK:-jmimg24}"
LOG=incoming/rollout.log

bump_task() {
  local n=${JM_TASK##*jmimg}
  JM_TASK="jmimg$((10#${n:-0} + 1))"
  echo "  -> task name burned, bumping to $JM_TASK" >> "$LOG"
}

already_have() {  # $1=jobfile : 每个 tag 是否都已有候选图
  python - "$1" <<'PY'
import glob, json, sys
j = json.load(open(sys.argv[1], encoding="utf-8"))
missing = [b["tag"] for b in j["batches"] if not glob.glob(f"incoming/*/{b['tag']}_*.png")]
print(",".join(missing))
sys.exit(0 if not missing else 1)
PY
}

run_stage() {  # $1=stage $2=jobfile
  local n
  for n in 1 2 3; do
    if JM_TASK="$JM_TASK" python jmkit.py "$1" "$2" >>"$LOG" 2>&1; then return 0; fi
    echo "[attempt $n] $1 $2 failed" >> "$LOG"
    "$CLI" finish --task "$JM_TASK" >>"$LOG" 2>&1
    bump_task
    sleep 5
  done
  return 1
}

echo "=== rollout start $(date +%H:%M:%S) task=$JM_TASK" | tee -a "$LOG"
for j in job_scene*.json; do
  if ! miss=$(already_have "$j"); then
    echo "=== $j resubmit missing: $miss" | tee -a "$LOG"
  else
    echo "=== $j skip (already collected)" | tee -a "$LOG"
    continue
  fi
  if ! run_stage submit "$j"; then echo "!!! submit FAILED $j" | tee -a "$LOG"; continue; fi
  sleep 90
  if ! run_stage collect "$j"; then echo "!!! collect FAILED $j" | tee -a "$LOG"; continue; fi
  echo "=== $j done $(date +%H:%M:%S)" | tee -a "$LOG"
done
echo "=== ALL DONE $(date +%H:%M:%S) task=$JM_TASK" | tee -a "$LOG"
find incoming -name "*__*.png" | wc -l
