"""FT-563, 19.10.2026: готовит атласы самоката из исходных imagegen-атласов.

1. Шаг (scooter-walk-v4 -> v5): кадры выровнены по голове и плечам — тело
   больше не дрожит при смене кадра, меняются только ноги. Вторая половина
   цикла — зеркало первой: у бегуна всего тела (нога и рука меняются, как в
   беге), у бабушки только ступней (сумка остаётся в той же руке). Качок
   в исходнике уже переставляет ноги по очереди. Сетка ровная: 3 x 4 ячейки.
2. Цвет: насыщенность +30 %, контраст +6 % для всех трёх атласов.

Запуск из корня веб-репозитория: python scripts/bake-scooter-sprites.py
"""
import numpy as np
from PIL import Image, ImageEnhance

SRC = 'src/assets/'
ROW_START, ROW_STEP, ROW_HEIGHT, SOURCE_HEIGHT = 20, 344, 352, 1448


def vivid(img):
    rgb, alpha = img.convert('RGB'), img.getchannel('A')
    rgb = ImageEnhance.Contrast(ImageEnhance.Color(rgb).enhance(1.3)).enhance(1.06)
    out = rgb.convert('RGBA'); out.putalpha(alpha); return out


def cells(atlas):
    w, h = atlas.size; cw = w // 3; ch = round(ROW_HEIGHT / SOURCE_HEIGHT * h)
    out = {}
    for c in range(3):
        for r in range(4):
            y = round((ROW_START + r * ROW_STEP) / SOURCE_HEIGHT * h)
            out[c, r] = np.array(atlas.crop((c * cw, y, (c + 1) * cw, y + ch)))
    return out, cw, ch


def upper(a):
    alpha = a[:, :, 3] > 128; rows = np.nonzero(alpha.any(1))[0]
    cut = rows.min() + (rows.max() - rows.min()) // 2
    mask = alpha.copy(); mask[cut:] = False; return mask.astype(float)


def shift(a, dx, dy):
    out = np.zeros_like(a); h, w = a.shape[:2]
    ys, yd = (slice(max(0, -dy), h - max(0, dy)), slice(max(0, dy), h - max(0, -dy)))
    xs, xd = (slice(max(0, -dx), w - max(0, dx)), slice(max(0, dx), w - max(0, -dx)))
    out[yd, xd] = a[ys, xs]; return out


def align(frame, reference):
    ref, best = upper(reference), (-1, 0, 0)
    for dy in range(-14, 15):
        for dx in range(-10, 11):
            score = (upper(shift(frame, dx, dy)) * ref).sum()
            if score > best[0]: best = (score, dx, dy)
    return shift(frame, best[1], best[2])


def centre_x(a):
    ys, xs = np.nonzero(upper(a)); return int(round(xs.mean()))


def mirror(a):
    c = centre_x(a); flipped = a[:, ::-1]; return shift(flipped, c - (a.shape[1] - 1 - c), 0)


def mirror_feet(a, hem, half):
    c = centre_x(a); out = a.copy()
    band = a[hem:, c - half:c + half][:, ::-1]
    # Мягкие края полосы: сверху и с боков, чтобы не было шва на подоле
    vertical = np.clip(np.arange(band.shape[0]) / 14.0, 0, 1)[:, None]
    horizontal = np.clip(np.minimum(np.arange(2 * half), np.arange(2 * half)[::-1]) / 16.0, 0, 1)[None, :]
    feather = (vertical * horizontal)[:, :, None]
    out[hem:, c - half:c + half] = (band * feather + a[hem:, c - half:c + half] * (1 - feather)).astype(a.dtype)
    return out


walk, cw, ch = cells(Image.open(SRC + 'scooter-walk-v4.png').convert('RGBA'))
frames = {}
for c in range(3):
    base = walk[c, 0]
    frames[c] = [base] + [align(walk[c, r], base) for r in range(1, 4)]
grandma, athlete, runner = frames[0], frames[1], frames[2]
hem = int(0.69 * ch)
cycles = [
    [grandma[0], grandma[1], mirror_feet(grandma[0], hem, int(0.15 * cw)), mirror_feet(grandma[1], hem, int(0.15 * cw))],
    athlete,
    [runner[0], runner[1], align(mirror(runner[0]), runner[0]), align(mirror(runner[1]), runner[0])],
]
sheet = Image.new('RGBA', (cw * 3, ch * 4), (0, 0, 0, 0))
for c, cycle in enumerate(cycles):
    for r, frame in enumerate(cycle): sheet.alpha_composite(Image.fromarray(frame), (c * cw, r * ch))
vivid(sheet).save(SRC + 'scooter-walk-v5.png', optimize=True)
for name, new in (('scooter-alley-v3', 'scooter-alley-v4'), ('scooter-traffic-v3', 'scooter-traffic-v4')):
    vivid(Image.open(SRC + name + '.png').convert('RGBA')).save(SRC + new + '.png', optimize=True)
print('ok', sheet.size)
