"""对 verify.mts 里刚加的三条美术门禁逐个灌缺陷，验它们真的会红。
每条坏法都点名"该红的那句话里必须含哪个关键词"——只数退出码会把
"闸咬住了"和"跑崩了"混成一件事。文件一律 mv 出去再 mv 回来，按字节还原。
"""
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))      # e:/CardGame
APP = os.path.join(ROOT, 'app')
SCENES = os.path.join(APP, 'src', 'assets', 'scenes')
NARR = os.path.join(APP, 'src', 'assets', 'narrators')
MOTION = os.path.join(SCENES, 'motion')
TMP = os.path.join(ROOT, '_qa', 'falsify_stash')
os.makedirs(TMP, exist_ok=True)

CASES = [
    # (名字, 准备动作, 该红的文案里必须含的关键词, 撤销动作)
    ('场景底-丢底',
     lambda: shutil.move(os.path.join(SCENES, 'xie__street.jpg'), os.path.join(TMP, 'xie__street.jpg')),
     '没有任何场景底',
     lambda: shutil.move(os.path.join(TMP, 'xie__street.jpg'), os.path.join(SCENES, 'xie__street.jpg'))),

    ('场景底-名单说谎',
     lambda: shutil.copyfile(os.path.join(SCENES, 'xie__street.jpg'), os.path.join(SCENES, 'diaolan__other.jpg')),
     '现在有场景底了',
     lambda: os.remove(os.path.join(SCENES, 'diaolan__other.jpg'))),

    ('动效-孤儿段',
     lambda: shutil.copyfile(os.path.join(MOTION, 'changhen_start.webp'), os.path.join(MOTION, 'diaolan_planning.webp')),
     '没有可解析的同名原画底',
     lambda: os.remove(os.path.join(MOTION, 'diaolan_planning.webp'))),

    ('动效-剧本前缀不认识',
     lambda: shutil.copyfile(os.path.join(MOTION, 'changhen_start.webp'), os.path.join(MOTION, 'nosuch_start.webp')),
     '不在剧本注册表里',
     lambda: os.remove(os.path.join(MOTION, 'nosuch_start.webp'))),

    ('叙述者-缺立绘',
     lambda: shutil.move(os.path.join(NARR, 'vp_lord.jpg'), os.path.join(TMP, 'vp_lord.jpg')),
     '叙述者立绘取不到',
     lambda: shutil.move(os.path.join(TMP, 'vp_lord.jpg'), os.path.join(NARR, 'vp_lord.jpg'))),
]


def say(s):
    # 控制台是 GBK，print 带 ✓/✗ 会抛 UnicodeEncodeError（本轮第一次就崩在这儿）
    sys.stdout.buffer.write((s + '\n').encode('utf-8'))


def run_verify():
    p = subprocess.run(['node', '--experimental-strip-types', 'scripts/verify.mts'],
                       cwd=APP, capture_output=True, text=True, encoding='utf-8', errors='replace')
    return p.returncode, (p.stdout or '') + (p.stderr or '')


bad = []
rc0, out0 = run_verify()
if ' 0 失败' not in out0:
    say('前置不成立：基线这一跑本来就有失败，先修基线再谈证伪')
    say('\n'.join([l for l in out0.splitlines() if '✗' in l][:6]))
    sys.exit(2)
say('基线: rc=%d 0 失败 [ok]' % rc0)

for name, setup, want, teardown in CASES:
    setup()
    try:
        rc, out = run_verify()
    finally:
        teardown()
    hit = [l for l in out.splitlines() if l.lstrip().startswith('✗') and want in l]
    ok = rc != 0 and hit
    say('%-22s rc=%d  含"%s"的红条 %d 条  %s' % (name, rc, want, len(hit), 'OK' if ok else '** 没咬住 **'))
    if not ok:
        bad.append(name)
    # 撤销之后必须回到基线：还原不干净的话后面几条的结论都不可信
    rc2, out2 = run_verify()
    if ' 0 失败' not in out2:
        bad.append(name + '（撤销后没回到基线）')
        say('   !! 撤销后仍有失败: ' + ' | '.join([l for l in out2.splitlines() if '✗' in l][:3]))

rc3, out3 = run_verify()
say('\n还原后复跑: %s' % ('0 失败 [ok]' if ' 0 失败' in out3 else '仍有失败 [BAD]'))
say('未还原干净的文件: %s' % (os.listdir(TMP) or '无'))
say('全部 %d 条坏法都被咬住' % len(CASES) if not bad else '以下坏法没咬住/没还原: %s' % ', '.join(bad))
sys.exit(1 if bad else 0)
