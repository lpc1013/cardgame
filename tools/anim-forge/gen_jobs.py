#!/usr/bin/env python3
"""按 live_scenes.json + ASSIGN 表，把 presets.json 展平成每幕一个 job。
新场景只需在 ASSIGN 里加一行预设组合，不必手写粒子参数。"""
import hashlib
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SPRITES = "E:/CardGame/tools/anim-forge/sprites/"

# 每幕的动效组合——按原画里真的存在什么来定，不套模板
ASSIGN = {
    "changhen/start": ["leaf_drift", "dust_motes"],
    "changhen/duel_intro": ["candle", "dust_motes"],
    "changhen/wuzhang": ["night_wind", "embers"],
    "diaolan/start": ["dust_motes"],
    "diaolan/coup_intro": ["night_wind"],
    "diaolan/boy": ["plain_wind"],
    "jianfeng/start": ["plain_wind"],
    "jianfeng/duel_city": ["snow_fall"],
    "jianfeng/aftermath": ["light_shaft", "embers"],
    "jieyu/start": ["candle"],
    "jieyu/p1_intro": ["blizzard", "embers"],
    "jieyu/p3_intro": ["snow_fall"],
    "shumian/start": ["blizzard"],
    "shumian/a2_intro": ["night_wind"],
    "shumian/a3_intro": ["embers"],
    "touming/start": ["rain", "candle"],
    "touming/ch2_court": ["dust_motes"],
    "touming/ch3_depart": ["dust_motes"],
    "xingxing/start": ["light_shaft", "dust_motes"],
    "xingxing/geban_intro": ["candle"],
    "xingxing/kaike": ["light_shaft", "dust_motes"],
}

DONE = {"changjiang/start", "changjiang/zhuanzhe", "changjiang/cheng_feng"}


def resolve(node, seed):
    if isinstance(node, dict):
        out = {}
        for k, v in node.items():
            if k == "sprite_file":
                out[k] = SPRITES + {"@mote": "mote.png", "@streak": "streak.png",
                                    "@leaf": "leaf.png", "@petal": "petal_pink.png",
                                    "@blob": "blob.png"}[v]
            elif k == "seed":
                out[k] = seed
            else:
                out[k] = resolve(v, seed)
        return out
    if isinstance(node, list):
        return [resolve(x, seed) for x in node]
    return node


def main():
    presets = json.load(open(os.path.join(HERE, "presets.json"), encoding="utf-8"))
    live = json.load(open(os.path.join(HERE, "live_scenes.json"), encoding="utf-8"))
    known = {f"{r['sc']}/{r['scene']}" for r in live}
    missing = [k for k in ASSIGN if k not in known]
    if missing:
        raise SystemExit(f"ASSIGN 引用了不存在的场景：{missing}")
    os.makedirs(os.path.join(HERE, "jobs"), exist_ok=True)
    made = 0
    for key, names in ASSIGN.items():
        if key in DONE:
            continue
        sc, scene = key.split("/")
        fx = []
        for n in names:
            fx.extend(json.loads(json.dumps(presets[n])))
        seed = int(hashlib.md5(key.encode()).hexdigest()[:6], 16)
        fx = resolve(fx, seed)
        # 预设里没写 seed 的，统一发一个按场景名散列的种子，避免各幕粒子场雷同
        for e in fx:
            e.get("params", {}).setdefault("seed", seed)
        job = {
            "src": f"E:/CardGame/app/src/assets/scenes/{sc}_{scene}.jpg",
            "size": [1920, 1080],
            "fps": 20,
            "seconds": 6.0,
            "preroll": 20,
            "effects": fx,
            "deliver": {
                "out": f"app/src/assets/scenes/motion/{sc}_{scene}.webp",
                "width": 1152, "height": 648, "quality": 58,
            },
        }
        path = os.path.join(HERE, "jobs", f"{sc}_{scene}.json")
        json.dump(job, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        made += 1
    print(f"wrote {made} jobs; {len(DONE)} scenes already baked")


if __name__ == "__main__":
    main()
