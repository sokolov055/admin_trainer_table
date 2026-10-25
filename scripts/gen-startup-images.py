"""Картинки запуска для сайта на экране «Домой» iPhone (FT-750).

Без них iPhone при запуске показывает белый экран и только потом страницу —
с серой вспышкой перед тёмной заставкой. Картинка — первый кадр заставки из
index.html: тёмный фон и знак 104 × 111 pt ровно в центре (тот же рисунок —
mobile/gen_splash.py у приложения из магазина). iPhone берёт её, только
если размер совпал с экраном до пикселя, поэтому по файлу на каждый экран.

Запуск из webapp/: python scripts/gen-startup-images.py — пишет
public/startup/*.png и строки <link> между отметками в index.html.
Новый iPhone с другим экраном — дописать в SCREENS.
"""
from pathlib import Path
import re
from PIL import Image, ImageDraw

BG = (0x23, 0x27, 0x26)
CREAM = (0xED, 0xE8, 0xDD)
GREEN = (0x4E, 0x9D, 0x69)
BARS = ((82, 176, 283, CREAM), (208, 302, 181, CREAM), (332, 429, 69, GREEN))
LEFT, TOP, BOTTOM = 82, 69, 440
SCALE = 0.3
W_PT, H_PT = (429 - LEFT) * SCALE, (BOTTOM - TOP) * SCALE

# Ширина и высота экрана в pt, плотность — портрет
SCREENS = (
    (440, 956, 3),  # 16 Pro Max, 17 Pro Max
    (402, 874, 3),  # 16 Pro, 17, 17 Pro
    (420, 912, 3),  # Air
    (430, 932, 3),  # 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
    (393, 852, 3),  # 14 Pro, 15, 15 Pro, 16
    (428, 926, 3),  # 12 Pro Max, 13 Pro Max, 14 Plus
    (390, 844, 3),  # 12, 13, 14, 16e
    (375, 812, 3),  # X, XS, 11 Pro
    (360, 780, 3),  # 12 mini, 13 mini
    (414, 896, 3),  # XS Max, 11 Pro Max
    (414, 896, 2),  # XR, 11
    (414, 736, 3),  # 6s Plus … 8 Plus
    (375, 667, 2),  # SE 2/3, 6s … 8
    (320, 568, 2),  # SE 1
)

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'startup'


def image(w, h, k):
    ss = 4
    big = Image.new('RGB', (round(W_PT * k * ss), round(H_PT * k * ss)), BG)
    d = ImageDraw.Draw(big)
    f = SCALE * k * ss
    for x0, x1, top, color in BARS:
        d.rectangle(((x0 - LEFT) * f, (top - TOP) * f, (x1 - LEFT) * f - 1, (BOTTOM - TOP) * f - 1), fill=color)
    mark = big.resize((round(W_PT * k), round(H_PT * k)), Image.LANCZOS)
    canvas = Image.new('RGB', (w * k, h * k), BG)
    canvas.paste(mark, (round((w * k - W_PT * k) / 2), round((h * k - H_PT * k) / 2)))
    return canvas


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    links = []
    for w, h, k in SCREENS:
        name = f'{w * k}x{h * k}.png'
        image(w, h, k).save(OUT / name, optimize=True)
        links.append(
            f'    <link rel="apple-touch-startup-image" href="startup/{name}" media="(device-width: {w}px) and '
            f'(device-height: {h}px) and (-webkit-device-pixel-ratio: {k}) and (orientation: portrait)" />')
    index = ROOT / 'index.html'
    raw = index.read_bytes().decode('utf-8')
    nl = '\r\n' if '\r\n' in raw else '\n'
    start, end = '    <!-- startup-images: начало -->', '    <!-- startup-images: конец -->'
    block = nl.join([start, *links, end])
    if start not in raw:
        raise SystemExit('В index.html нет отметки «startup-images: начало»')
    raw = re.sub(re.escape(start) + r'.*?' + re.escape(end), lambda _: block, raw, flags=re.S)
    index.write_bytes(raw.encode('utf-8'))
    print(len(links), 'картинок запуска')


if __name__ == '__main__':
    main()
