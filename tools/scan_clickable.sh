#!/usr/bin/env bash
# 用 tools/clickable_probe.js 扫一批屏，找"可点元素被裁/被压住"这一类缺陷。
# 每条跑一次 headless Chrome（约 15~20s），结果逐行打印，末尾汇总。
# 为什么值得等：这一类缺陷我这一轮撞过两次（牌桌动作条被 overflow 裁成空框、
# 五艺钉住的答题栏压住玩家的牌），两次都是肉眼看截图才发现，几何闸和对比度闸都放过它。
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
PROBE="$(cat tools/clickable_probe.js)"
OUT=_qa/clickable_scan.jsonl
: > "$OUT"

# 字段: 名称 | 宽 | 高 | 生成器(screen|screen|duel) | 额外参数
ROWS=(
 "panel_商市|1440|900|panel|text:商市"
 "panel_书斋|1440|900|panel|text:书斋"
 "panel_行囊|1440|900|panel|text:行囊"
 "panel_图鉴|1440|900|panel|text:图鉴"
 "panel_卡册|1440|900|panel|text:卡册"
 "panel_成就|1440|900|panel|text:成就"
 "panel_规则书|1440|900|panel|text:规则书"
 "panel_设置|1440|900|panel|text:设置"
 "case_正文|1440|900|screen|fuma|search|"
 "case_勘查层|1440|900|screen|fuma|search|\"text:勘查\""
 "case_市集|1440|900|screen|fuma|market|"
 "case_结案|1440|900|screen|fuma|verdict|"
 "case_结局|1440|900|screen|fuma|end_a_win|"
 "case_舆图|1440|900|screen|fuma|search_gate|\"text:舆图\""
 "case_卷宗|1440|900|screen|fuma|search|\"text:卷宗\""
 "case_背包编组|1440|900|screen|fuma|search|\"text:背包\""
 "case_五艺牌九|1440|900|screen|sichou|sc_paijiu|"
 "case_五艺对联|1440|900|screen|fuma|wenchat|"
 "case_五艺证词|1440|900|screen|qiuwei|qw_logic|"
 "case_五艺棋局|1440|900|screen|xie|xie_weigi|"
 "case_五艺行令|1440|900|screen|qinhuai|jiuling_scene|"
 "duel_牌桌|1440|900|duel|||"
 "m_牌桌|844|390|duel|||"
 "m_结局|844|390|screen|fuma|end_a_win|"
 "m_五艺牌九|844|390|screen|sichou|sc_paijiu|"
 "m_勘查层|844|390|screen|fuma|search|\"text:勘查\""
 "m_图鉴|844|390|panel|text:图鉴"
 "m_商市|844|390|panel|text:商市"
)

for row in "${ROWS[@]}"; do
  IFS='|' read -r name w h kind a b c <<< "$row"
  case "$kind" in
    # panel：标题页直接点入口，不需要存档
    panel) cfg=$(python - "$a" <<'PY'
import json,sys
print(json.dumps({"mode":"light","theme":"","clicks":[sys.argv[1]],"settle":1700},ensure_ascii=False))
PY
) ;;
    # screen：塞一个存档落到指定幕，进档后再点（c 可空）
    screen) node _qa/screen_cfg.cjs --sc "$a" --scene "$b" --clicks "${c:-[]}" --settle 1700 >/dev/null 2>&1
            cfg=$(cat _qa/screen_cfg.json) ;;
    # duel：牌桌走 fuma/d_wang（这一局有博弈动作条，是探针的已知靶子）
    duel)   node _qa/duel_cfg.cjs --mode light --theme "" --out _qa/duel_cfg.json >/dev/null 2>&1
            cfg=$(cat _qa/duel_cfg.json) ;;
  esac
  # 按内容抓，不按行号：点击 MISS 时 px_shot 会多打一行警告，
  # 早先用 sed -n '2p' 就会把"截图字节数"那行当成结果存进去，8 个 panel 行全废。
  line=$(node tools/px_shot.mjs --out "_qa/_scan_tmp.png" --w "$w" --h "$h" --click-gap 2400 --cfg "$cfg" --eval "$PROBE" 2>&1 | grep -o 'eval: .*' | head -1)
  printf '%s\t%s\n' "$name" "$line" >> "$OUT"
  echo "--- $name"
  printf '%s' "$line" | python -c "
import sys,json
raw=sys.stdin.read()
i=raw.find('eval: ')
if i<0: print('   NO-EVAL:', raw[:120]); sys.exit()
try: d=json.loads(raw[i+6:])
except Exception as e: print('   PARSE-FAIL', e, raw[i+6:i+140]); sys.exit()
print('   screen=%s checked=%d clipped=%d occluded=%d offscreen=%d' % (d.get('screen','?'), d['checked'], len(d['clipped']), len(d['occluded']), len(d['offscreen'])))
for k in ('clipped','occluded'):
    for x in d[k]: print('    [%s] %s' % (k.upper(), json.dumps(x, ensure_ascii=False)))
"
done
echo "=== 汇总 ==="
python - <<'PY'
import json,re
bad=0; tot=0
for l in open('_qa/clickable_scan.jsonl',encoding='utf-8',errors='replace'):
    i=l.find('eval: ')
    if i<0: continue
    name=l[:i].split('\t')[0]
    try: d=json.loads(l[i+6:])
    except Exception: continue
    tot+=1
    n=len(d['clipped'])+len(d['occluded'])
    if n: bad+=1; print('  有问题: %s (%d 处)'%(name,n))
print('扫了 %d 屏，其中 %d 屏有被裁/被压的可点元素' % (tot,bad))
PY
rm -f _qa/_scan_tmp.png
