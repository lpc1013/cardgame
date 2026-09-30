import io, os, re, json, shutil, glob, sys

ART_ROOT = r"C:\Users\Pengcheng_Li\AppData\Local\Tabbit Browser\User Data\LocalAgent\Runtime\artifacts"
OUT = "_qa"
# 收哪一批：manifest + 落盘前缀。默认收主题图，收卡墙时传 card_shots.json c_
MANIFEST = sys.argv[1] if len(sys.argv) > 1 else "theme_shots.json"
PREFIX = sys.argv[2] if len(sys.argv) > 2 else "t_"

d = json.load(io.open(f"{OUT}/{MANIFEST}", encoding="utf-8"))
wanted = {v["file"] for k, v in d.items() if isinstance(v, dict)}

# 真实落盘名是 `<我传的basename去扩展>-shot-<uuid>.png`（path 只是文件名提示），
# 所以按前缀反推，别拿 basename 直接对。同名会散落在多个 task 目录（任务名烧掉后换目录），取最新那份。
found = {}
for p in glob.glob(os.path.join(ART_ROOT, "*", f"{PREFIX}*-shot-*.png")):
    name = re.sub(r"-shot-[a-f0-9-]+\.png$", ".png", os.path.basename(p))
    if name not in wanted:
        continue
    if name not in found or os.path.getmtime(p) > os.path.getmtime(found[name]):
        found[name] = p

for name in wanted:
    if name in found:
        shutil.copyfile(found[name], os.path.join(OUT, name))

have = sorted(n for n in wanted if os.path.exists(os.path.join(OUT, n)))
print(f"copied {len(have)}/{len(wanted)}")
print("missing:", sorted(wanted - set(have)))
