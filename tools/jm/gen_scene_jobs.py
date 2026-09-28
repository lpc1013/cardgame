#!/usr/bin/env python3
"""把缺背景的场景按「地点」聚类，逐类生成一条取自本幕原文物象的提示词。

不是一幕一张：同一间房在不同幕必须长得一样，且 487 幕逐张产既烧积分也必然趋同。
"""
import io
import json
import os
import re
import sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))

# 地点判定：**先看标题再看首行**。标题是地点显式的（卷宗入库 / 府中·一夜 / 散衙之后），
# 首行容易撞成语——实测「无法自圆其说」里的"关"把结局幕判成城楼、"顺水推舟"里的"舟"
# 把圆谎幕判成船舱。故关键词一律双字以上，且不再用 mansion_yard 当静默兜底。
SETTINGS = [
    ("prison", ("大牢", "牢房", "诏狱", "狱", "囚")),
    ("council_hall", ("公堂", "大堂", "散衙", "衙", "官署", "口供", "过堂", "庭审", "供称")),
    ("tavern", ("酒家", "酒楼", "酒馆", "茶肆", "茶棚", "文萃堂", "酒摊", "夜市", "灯市")),
    ("study", ("卷宗", "案头", "书房", "书斋", "灯下", "文书", "案牍", "归档", "烛")),
    ("palace_hall", ("紫禁城", "宫殿", "丹墀", "御榻", "后宫", "偏院", "宫", "殿", "朝")),
    ("wall_gate", ("城头", "城门", "九门", "德胜门", "城墙", "垛口", "城楼", "门楼", "城关", "关隘")),
    ("camp", ("帅帐", "营", "帐", "令旗", "壕", "寨", "军")),
    ("street", ("街", "市", "坊", "巷", "铺子", "渡口", "长亭", "大道")),
    ("boat_house", ("画舫", "舟中", "船舱", "艄公", "乌篷", "泊")),
    ("mansion_yard", ("府", "宅", "院", "庭", "回廊", "花窗", "园", "亭", "榻")),
    ("village", ("祠堂", "村", "田", "灶", "晒谷", "窑", "窝棚", "山寨", "乡", "垄")),
    ("field_road", ("山道", "谷", "坡", "林", "野", "雪原", "河滩", "战场", "阵")),
    ("river", ("江", "河", "淮", "水门", "堤", "湖", "池")),
]
# 每部的画风锚（沿用已上色场景与结局图既定的调子）
STYLE = {
    "fuma": "明代哑光电影感水墨", "qiuwei": "明代哑光电影感水墨",
    "sichou": "明代哑光电影感水墨", "xie": "明代哑光电影感水墨",
    "qinhuai": "明代哑光电影感水墨", "jieyu": "明代哑光电影感水墨",
    "touming": "明代哑光电影感水墨", "jianfeng": "明代哑光电影感水墨",
    "changhen": "魏晋工笔淡墨", "diaolan": "晚唐哑光水墨",
    "shumian": "秦汉史诗水墨", "changjiang": "南朝宋哑光电影感水墨",
    "xingxing": "民国乡村水墨",
}
SETTING_DESC = {
    "prison": "牢房内景：潮湿石墙、一束从高处小窗落下的冷光、木栅与草铺、一盏将尽的油灯",
    "council_hall": "官衙公堂内景：高悬的匾额下是一张案牍，两侧仪杖与卷架，青砖地，光线从高窗斜入",
    "study": "书房夜景：案头摊开卷宗与烛台，笔架印匣齐整，窗外是黑的，室内只有一圈暖光",
    "palace_hall": "宫殿内景：粗柱与深色调藻井，御座或长案居中，地面反着幽光，殿深处暗",
    "wall_gate": "城墙与城门景：垛口、女墙、门洞与吊桥构件，远处是城外旷野或城内屋脊",
    "camp": "军中营帐内外：令旗、战鼓、马桩、连绵帐篷与篝火，夜色或晨雾",
    "street": "市井街景：店铺幌子、挑担行人留下的空街、石板路与屋檐，市声将歇",
    "tavern": "酒家茶肆内外：幌子与门板、条凳与酒旗、檐下灯笼，堂内一桌残茶具",
    "boat_house": "舟舫内景或泊岸：船窗、橹、缆绳与水面反光，夜色里灯火倒映",
    "mansion_yard": "宅第庭院：回廊、花窗、石阶与一株老树，晨昏光线柔和",
    "village": "乡野村落：土墙草顶、晒场、田埂与远处低山，炊烟或夜色",
    "field_road": "郊野战场或山道：残雪、碎石、折旗与烟尘，地平线压得很低",
    "river": "江河堤岸：水面开阔、渡船与芦苇、远处堤线与城影",
}
TAIL = ("横屏16:9游戏场景背景，无人物出现，构图留出中下部给文字叠加。"
        "整体低饱和、宣纸质感、边缘轻微晕染，光影对比明确但不过度戏剧化。"
        "画面中不要出现文字、汉字、字母、数字、印章、落款、题跋、水印、UI界面、按钮、对话框，"
        "不要出现任何可辨人脸或人物形象。")


def classify(title, first):
    """标题优先判定；标题没命中再用首行；都不命中归 other，绝不静默塞进某个地点。"""
    for hay in (title or "", first or ""):
        for key, kws in SETTINGS:
            for w in kws:
                if w in hay:
                    return key
    return "other"


def build_edges(body):
    """一幕的去向：next / 选项 next / 选项 altNext / 对局与小游戏胜负转场。"""
    out = re.findall(r'\b(?:next|altNext|winNext|loseNext):\s*"([a-zA-Z0-9_]+)"', body)
    return out


def propagate(sid, scenes, setting_of, edges):
    """无地点线索的幕，沿剧情图继承：取「指向它的那些幕」里最常见的已定地点。
    多轮传播，让链条后段也能接上。"""
    preds = {k: [] for k in scenes}
    for src, dsts in edges.items():
        for d in dsts:
            if d in preds:
                preds[d].append(src)
    for _ in range(4):
        changed = False
        for scene_id, s in list(setting_of.items()):
            if s != "other":
                continue
            cand = [setting_of.get(p) for p in preds[scene_id] if setting_of.get(p) not in (None, "other")]
            if not cand:
                # 没有前驱就用后继（线性幕间 next 链）
                cand = [setting_of.get(d) for d in edges.get(scene_id, [])
                        if setting_of.get(d) not in (None, "other")]
            if cand:
                setting_of[scene_id] = max(set(cand), key=cand.count)
                changed = True
        if not changed:
            break
    return setting_of


TIME_KEYS = [
    ("night", ("入夜", "深夜", "夜", "灯下", "烛", "更", "月")),
    ("dawn", ("拂晓", "黎明", "天刚", "晨光", "破晓")),
    ("dusk", ("黄昏", "暮", "傍晚", "日落", "残阳")),
]


def time_of(title, first):
    """只在文本明确点出时辰时才给光照变体，否则并入基础图——
    否则 84 个地点会被时间乘成两百多张，既烧积分也让同一间房碎成好几种样子。"""
    hay = (title or "") + (first or "")
    for key, kws in TIME_KEYS:
        if any(w in hay for w in kws):
            return key
    return ""


def classify_all(scenes):
    """返回 {sceneId: settingKey}，settingKey 可能带时间后缀（study_night）。"""
    out = {}
    for scene_id, meta in scenes.items():
        base = classify(meta.get("title", ""), meta.get("first", ""))
        out[scene_id] = base
    # 时间分层只在地点已定后叠加，且 other 不参与（它靠继承，时辰不可靠）
    for scene_id, meta in scenes.items():
        base = out[scene_id]
        if base == "other":
            continue
        t = time_of(meta.get("title", ""), meta.get("first", ""))
        if t:
            out[scene_id] = f"{base}_{t}"
    return out


TIME_CLAUSE = {
    "night": "时值入夜，主光源是烛火或油灯，暖光只照亮近处，远处沉进冷黑",
    "dawn": "时值拂晓，天光青灰，室内尚未点灯，影子很长很淡",
    "dusk": "时值黄昏暮色，斜光低角度入窗，尘埃可见，暖冷交界",
}


def emit_jobs(plan, only=None, per_job=4):
    """每个地点一条提示词：画风锚 + 地点母题 + 时辰光照 + 本幕文本里的物象线索。"""
    jobs = []
    n = 0
    for sid, d in plan.items():
        if only and sid != only:
            continue
        batches = []
        for key, v in sorted(d.items(), key=lambda x: -len(x[1]["scenes"])):
            if key == "other":
                continue
            base = key.split("_")[0]
            t = key.split("_", 1)[1] if "_" in key else ""
            cue = v["cues"][0] if v["cues"] else ""
            prompt = (f"{STYLE.get(sid, '明代哑光电影感水墨')}，横屏16:9游戏场景背景。"
                      f"{SETTING_DESC.get(base, '')}。{TIME_CLAUSE.get(t, '自然光，明暗层次清楚但不极端')}。"
                      f"本幕情境线索（只用来决定画面里该有什么物件，不要把它写成字）：{cue.rstrip('。')}。" + TAIL)
            batches.append({"tag": f"{sid}__{key}", "prompt": prompt})
        for i in range(0, len(batches), per_job):
            n += 1
            jobs.append({"out": f"E:/CardGame/tools/jm/incoming/scene{n}", "ratio": "16:9",
                         "count": 4, "model": "Seedream 5.0 Lite",
                         "batches": batches[i:i + per_job]})
    for i, j in enumerate(jobs, 1):
        j["out"] = f"E:/CardGame/tools/jm/incoming/scene{i:02d}"
        p = os.path.join(HERE, f"job_scene{i:02d}.json")
        json.dump(j, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print(f"job_scene{i:02d}.json", [b["tag"] for b in j["batches"]])
    return jobs


def main():
    sc = json.load(open(os.path.join(HERE, "scene_text.json"), encoding="utf-8"))
    art = {f.rsplit(".", 1)[0].lower()
           for f in os.listdir(os.path.join(HERE, "../../app/src/assets/scenes"))
           if f.endswith(".jpg")}
    plan = {}
    for sid, scenes in sc.items():
        # 剧情边直接从数据文件取：scene_text.json 只有标题与首行
        raw = open(os.path.join(HERE, f"../../app/src/data/{sid}.ts"), encoding="utf-8").read()
        i = raw.find("\n  scenes: [")
        j = raw.find("\n  viewpoints:", i)
        if j < 0:
            j = raw.find("\n  duels:", i)
        blk = raw[i:j if j > 0 else len(raw)]
        ind = re.search(r"\n(\s+)id:", blk).group(1)
        parts = re.split(r"\n" + ind + r'id:\s*"([a-zA-Z0-9_]+)"', blk)
        edges = {parts[k]: build_edges(parts[k + 1]) for k in range(1, len(parts), 2)}
        setting_of = classify_all(scenes)
        propagate(sid, scenes, setting_of, edges)
        for scene_id, meta in scenes.items():
            if f"{sid}_{scene_id}".lower() in art:
                continue
            key = setting_of.get(scene_id, "other")
            slot = plan.setdefault(sid, {}).setdefault(key, {"scenes": [], "cues": []})
            slot["scenes"].append(scene_id)
            cue = (meta.get("title", "") + " " + meta.get("first", "")).strip()
            if len(cue) > 8:
                slot["cues"].append(cue[:60])
    json.dump(plan, open(os.path.join(HERE, "scene_plan.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    uniq = sum(len(v) for v in plan.values())
    total = sum(len(s["scenes"]) for v in plan.values() for s in v.values())
    print(f"{total} 幕缺背景 -> 聚成 {uniq} 个地点（复用率 {total/uniq:.1f}x）")
    for sid in sorted(plan, key=lambda x: -len(plan[x])):
        print(f"  {sid:12s} {len(plan[sid]):2d} 地点 / {sum(len(s['scenes']) for s in plan[sid].values()):3d} 幕")
    # 出前端要用的映射：剧本 -> 幕 id -> 地点键。资产名 scenes/<剧本>__<地点键>.jpg
    mapping = {sid: {s: k for k, v in d.items() for s in v["scenes"]} for sid, d in plan.items()}
    ts = ("// 由 tools/jm/gen_scene_jobs.py 生成，勿手改：缺背景幕的「地点 -> 复用图」映射。\n"
          "// 同一间房在不同幕必须长得一样，故缺背景幕按「地点」复用同一张背景图。\n"
          "export const SCENE_SETTING: Record<string, Record<string, string>> = "
          + json.dumps(mapping, ensure_ascii=False, indent=1) + ";\n")
    with open(os.path.join(HERE, "../../app/src/data/sceneSettings.ts"), "w", encoding="utf-8") as fh:
        fh.write(ts)
    print(f"已写 app/src/data/sceneSettings.ts（{sum(len(v) for v in mapping.values())} 幕）")
    only = sys.argv[1] if len(sys.argv) > 1 else None
    if only:
        emit_jobs(plan, only=only)
    others = {f"{sid}:{k}": v["scenes"] for sid, d in plan.items() for k, v in d.items() if k == "other"}
    if others:
        print("\n未归类 other（需人工安置，不给它产图）：")
        for sid, sc in others.items():
            print(f"  {sid:16s} {len(sc):2d} 幕  {', '.join(sc[:10])}")
    return plan


if __name__ == "__main__":
    main()
