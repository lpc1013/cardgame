"""9 张结局插画重命名 + resize 落位（1792×1024，质量 88）。
源 PNG 来自 ImageGen 批量产物，按生成顺序一一对应缺失场景。"""
from PIL import Image
import os, glob

SRC_DIR = r"E:\CardGame\app\src\assets\endings"
DST_DIR = SRC_DIR

# 源文件前缀 → 目标名（按 ImageGen 调用顺序）
MAP = [
    ("A_war_weary_Ming_dynasty_Chine",       "end_jieyu_p2_duel_slow.jpg"),
    ("An_old_prisoner_in_a_dim_stone",         "end_jieyu_p5_light_robe.jpg"),
    ("An_empty_imperial_Chinese_thro",         "end_qiuwei_end_thunder_fall.jpg"),
    ("A_Han_dynasty_Chinese_general_",         "end_shumian_end_jogou.jpg"),
    ("Two_old_men_drinking_rice_wine",         "end_shumian_end_lianggong.jpg"),
    ("A_young_Chinese_man_in_scholar",         "end_touming_ch2_tea_lose.jpg"),
    ("A_cold_faced_Chinese_general_c",         "end_touming_ch3_canon_cold.jpg"),
    ("Five_objects_arranged_on_a_cle",         "end_xie_end_surface.jpg"),
    ("An_old_female_Chinese_teacher_",         "end_xingxing_xx_teacher_years.jpg"),
]

TARGET = (1792, 1024)

for prefix, dst_name in MAP:
    srcs = glob.glob(os.path.join(SRC_DIR, prefix + "*.png"))
    if not srcs:
        print("MISS SRC", prefix)
        continue
    src = srcs[0]
    dst = os.path.join(DST_DIR, dst_name)
    im = Image.open(src).convert("RGB")
    im = im.resize(TARGET, Image.LANCZOS)
    im.save(dst, "JPEG", quality=88, optimize=True)
    # 删源 PNG
    try:
        os.remove(src)
    except OSError:
        pass
    sz = os.path.getsize(dst) // 1024
    print(f"OK  {dst_name}  ({im.size})  {sz}KB  <- {os.path.basename(src)}")

# 清理临时参考图
for tmp in (r"E:\CardGame\app\_ref_end.jpg", r"E:\CardGame\app\src\assets\endings\.gitkeep"):
    if os.path.exists(tmp):
        try: os.remove(tmp)
        except OSError: pass

# 列出最终 endings 目录图数
n = len([f for f in os.listdir(DST_DIR) if f.endswith(".jpg")])
print(f"\nendings/ 现 {n} 张 jpg")
