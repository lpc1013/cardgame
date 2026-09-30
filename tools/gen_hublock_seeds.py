"""为"全条件选项"的幕生成最坏情况存档：把每条 cond 反着喂，看屏上还剩几个可见选项。

静态闸只能问"有没有无条件出口"，答不了"条件是不是必然可满足"——那是数值问题。
这里把 notFlag 全部置上、statAtLeast 一律给到 n-1、cluesAtLeast 给到 n-1 条线索，
喂给运行时数一遍可见选项：0 个就是硬死锁（该状态一旦可达，玩家出不去）。
"""
import io
import json
import re

DATA = r"E:/CardGame/app/src/data"
OUT = r"E:/CardGame/_qa/hublock_seeds.json"

# verify.mts 报出来的七幕（4 部剧本）
TARGETS = [
    ("sichou", "hub"), ("qinhuai", "hub"),
    ("shumian", "a2_guling_lose"), ("shumian", "a3_after"),
    ("changhen", "final"), ("changhen", "epilogue_cut"), ("changhen", "epilogue_oath"),
]


def block(text, start):
    """从 start 起做花括号配对，返回该数组/对象字面量的原文"""
    i = text.index("{", start)
    d = 0
    for j in range(i, len(text)):
        if text[j] == "{":
            d += 1
        elif text[j] == "}":
            d -= 1
            if d == 0:
                return text[i:j + 1]
    return ""


def scene_text(t, sid):
    i = t.index('id: "%s"' % sid)
    j = t.find('id: "', i + 10)
    return t[i:j if j > 0 else len(t)]


def clue_ids(t):
    i = t.find("clues:")
    if i < 0:
        return []
    return re.findall(r'\{\s*id:\s*"([A-Za-z0-9_]+)"', t[i:i + 12000])


out = []
for scen, sid in TARGETS:
    t = io.open("%s/%s.ts" % (DATA, scen), encoding="utf-8").read()
    seg = scene_text(t, sid)
    ci = seg.find("choices:")
    choices = re.findall(r"\{[^{}]*\}", seg[ci:], re.S) if ci >= 0 else []
    flags, stats, cards, maxclue = set(), {}, set(), 0
    # 键名两种写法都要收：同一份数据里 scenes 段用裸键（next: "x"）、bonus 段用 JSON 风格
    # （"setFlag": "x"）。只匹配裸键会把已经接好的线读成没接——这条坑真栽过一次。
    def key(name):
        return r'"?%s"?\s*:\s*"([^"]+)"' % name
    for c in choices:
        for m in re.findall(key("notFlag"), c):
            flags.add(m)
        for m in re.findall(key("notCard"), c):
            cards.add(m)
        for m in re.findall(r'"?cluesAtLeast"?\s*:\s*(\d+)', c):
            maxclue = max(maxclue, int(m))
        for m in re.findall(r'"?statAtLeast"?\s*:\s*\{([^}]*)\}', c):
            for k, v in re.findall(r"(\w+)\s*:\s*(\d+)", m):
                stats[k] = min(stats.get(k, 0), int(v) - 1)
    ids = clue_ids(t)
    out.append({
        "scenario": scen, "scene": sid, "choices": len(choices),
        "flags": sorted(flags), "stats": stats, "bag": sorted(cards),
        # 给到 n-1 条：正好卡在 cluesAtLeast 的门槛下面
        "clues": ids[:max(maxclue - 1, 0)],
        "cluesAtLeast": maxclue,
        "totalClues": len(ids),
    })

io.open(OUT, "w", encoding="utf-8").write(json.dumps(out, ensure_ascii=False, indent=1))
for o in out:
    print(o["scenario"], o["scene"], "choices=%d" % o["choices"], "flags=%s" % o["flags"],
          "stats=%s" % o["stats"], "clues=%d/%d" % (len(o["clues"]), o["totalClues"]),
          "gate=%d" % o["cluesAtLeast"])
