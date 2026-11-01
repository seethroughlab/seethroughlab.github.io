#!/usr/bin/env python3
"""Redraw the Cassvision page's Form drawing (left side and rear, dimensioned, 1 unit = 1 mm) from the
Cassvision repo's enclosure/pxl_case.py, and write it into src/components/cassvision/Form.astro.

    ~/Developer/cassvision/enclosure/.venv/bin/python scripts/cassvision-form-drawing.py

Run it with the Cassvision enclosure's Python (it imports build123d). CASSVISION overrides the repo path.
"""
import os
import re
import sys
from pathlib import Path
CASSVISION = Path(os.environ.get('CASSVISION', Path.home() / 'Developer' / 'cassvision'))
sys.path.insert(0, str(CASSVISION / 'enclosure'))
import pxl_case as c
f = lambda v: f"{v:.2f}".rstrip('0').rstrip('.')
TOP = 22                       # svg y of the body's top (z = 61)
Y = lambda z: TOP + (c.BODY_H - z)
SX = lambda x: 86 + x          # side view, seen from the left: front (lens) on the left
RX = lambda y: 286 + y         # rear view, as the operator sees it: camera-right on the right
o = []
def rect(x0, y0, x1, y1, cls, r=0):
    o.append(f'<rect x="{f(min(x0,x1))}" y="{f(min(y0,y1))}" width="{f(abs(x1-x0))}" height="{f(abs(y1-y0))}"' + (f' rx="{f(r)}"' if r else '') + f' class="{cls}"/>')
def circ(x, y, r, cls): o.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" class="{cls}"/>')
def text(x, y, s, cls, anchor=None): o.append(f'<text x="{f(x)}" y="{f(y)}" class="{cls}"' + (f' text-anchor="{anchor}"' if anchor else '') + f'>{s}</text>')
def hdim(x0, x1, y, label):
    o.append(f'<line x1="{f(x0)}" y1="{f(y)}" x2="{f(x1)}" y2="{f(y)}" class="dim"/>')
    for x in (x0, x1): o.append(f'<line x1="{f(x)}" y1="{f(y-4)}" x2="{f(x)}" y2="{f(y+4)}" class="dim"/>')
    text((x0 + x1) / 2, y + 10, label, 'lbl-ink', 'middle')
def vdim(x, y0, y1, label, side=1):
    o.append(f'<line x1="{f(x)}" y1="{f(y0)}" x2="{f(x)}" y2="{f(y1)}" class="dim"/>')
    for y in (y0, y1): o.append(f'<line x1="{f(x-4)}" y1="{f(y)}" x2="{f(x+4)}" y2="{f(y)}" class="dim"/>')
    text(x + 4 * side, (y0 + y1) / 2 + 2, label, 'lbl-ink', 'start' if side > 0 else 'end')

L2, zc = c.BODY_L / 2, c.BODY_H / 2
bx = -L2 - c.BARREL_L
ring_front = bx - c.RING_T
glass_back = L2 - 2.0                              # module board face; the glass stands 3.5 proud of it
glass_rear = glass_back + c.SCREEN_GLASS_T
gz = c.SCREEN_Z + c.SCREEN_GLASS_DZ
cap_bot = -c.GRIP_LEN - 2.0
zt, zb = c.TRIGGER_Z; zmid = (zt + zb) / 2
gfront = c.GRIP_TOP[0] + c.GRIP_RAKE * (-zmid / c.GRIP_LEN)

# ---- side view (left)
text(SX(ring_front), 12, 'Left side', 'view')
grip = c.grip_profile()
o.append('<polygon points="' + ' '.join(f"{f(SX(x))},{f(Y(z))}" for x, z in grip) + '" class="shell"/>')
capx = c.grip_axis_x(-c.GRIP_LEN) + 1.5
rect(SX(capx - 12.5), Y(-c.GRIP_LEN), SX(capx + 12.5), Y(cap_bot), 'shell', 0.8)
# trigger: the part standing forward of the grip's front face
rect(SX(gfront - 2.0), Y(zt - c.FIT), SX(gfront + 0.5), Y(zb + c.FIT), 'recf', 1.2)
rect(SX(-L2), Y(c.BODY_H), SX(L2), Y(0), 'shell', c.FRONT_R)
o.append(f'<line x1="{f(SX(L2 - c.BEZEL_DEPTH))}" y1="{f(Y(c.BODY_H) + 1)}" x2="{f(SX(L2 - c.BEZEL_DEPTH))}" y2="{f(Y(0) - 1)}" class="dim"/>')
rect(SX(glass_back + 2.0), Y(gz + c.SCREEN_GLASS_H / 2), SX(glass_rear), Y(gz - c.SCREEN_GLASS_H / 2), 'scr')
rect(SX(bx), Y(zc + c.BARREL_OD / 2), SX(-L2), Y(zc - c.BARREL_OD / 2), 'shell', 1)
rect(SX(ring_front), Y(zc + c.BARREL_OD / 2), SX(bx), Y(zc - c.BARREL_OD / 2), 'door')
rect(SX(ring_front - 0.6), Y(zc + c.WINDOW_D / 2 - 1.5), SX(ring_front), Y(zc - c.WINDOW_D / 2 + 1.5), 'glass')
# the mark on the left side
k = c.LOGO_MARK_W / 136.0; mx, mz = c.LOGO_POS
rect(SX(mx - 68 * k), Y(mz + 52 * k), SX(mx + 68 * k), Y(mz - 52 * k), 'mark', 20 * k)
circ(SX(mx + 22 * k), Y(mz + 16 * k), 13 * k, 'mark')
dx, dz, dr = c.logo_dot(); circ(SX(dx), Y(dz), dr, 'recf')
text(SX(gfront - 4), Y(zmid) + 2, 'REC trigger', 'lbl', 'end')
text(SX(-12) - 4, Y(cap_bot) - 1, '¼-20 tripod insert', 'lbl', 'end')
hdim(SX(ring_front), SX(glass_rear), Y(cap_bot) + 14, f'{f(round(glass_rear - ring_front))} long')
vdim(SX(glass_rear) + 12, Y(c.BODY_H), Y(cap_bot), f'{f(round(c.BODY_H - cap_bot))}')

# ---- rear view
text(RX(-c.BODY_W / 2), 12, 'Rear', 'view')
gw = 30.0
rect(RX(-gw / 2), Y(0), RX(gw / 2), Y(-c.GRIP_LEN), 'shell', 2)
rect(RX(-12.5), Y(-c.GRIP_LEN), RX(12.5), Y(cap_bot), 'shell', 0.8)
rect(RX(-c.BODY_W / 2), Y(c.BODY_H), RX(c.BODY_W / 2), Y(0), 'shell', c.BODY_R)
rect(RX(-c.SCREEN_GLASS_W / 2), Y(gz + c.SCREEN_GLASS_H / 2), RX(c.SCREEN_GLASS_W / 2), Y(gz - c.SCREEN_GLASS_H / 2), 'scr', 0.6)
rect(RX(-48.96 / 2), Y(gz + 36.72 / 2), RX(48.96 / 2), Y(gz - 36.72 / 2), 'active')
for y, z in c.screen_holes(): circ(RX(y), Y(z), 1.9, 'knob')
circ(RX(c.LED_POS[0]), Y(c.LED_POS[1]), c.LED_D / 2 - 0.1, 'recf')
text(RX(c.BODY_W / 2) + 3, Y(c.LED_POS[1]) + 2, 'REC light', 'lbl')
text(RX(0), Y(gz) + 2, '2.4" 320×240', 'lbl-scr', 'middle')
hdim(RX(-c.BODY_W / 2), RX(c.BODY_W / 2), Y(cap_bot) + 14, f'{f(c.BODY_W)} wide')
vdim(RX(-c.BODY_W / 2) - 10, Y(c.BODY_H), Y(0), f'{f(c.BODY_H)}', -1)

W = RX(c.BODY_W / 2) + 40; H = Y(cap_bot) + 30
svg = (f'<svg viewBox="0 0 {f(W)} {f(H)}" role="img" aria-label="The final case, side and rear, in millimetres: body {f(c.BODY_L)} long, {f(c.BODY_H)} tall, {f(c.BODY_W)} wide; '
       f'{f(round(glass_rear - ring_front))} long with the lens barrel and screen, {f(round(c.BODY_H - cap_bot))} tall with the grip; 2.4 inch screen on the rear, REC light below it on the right, '
       f'trigger REC at the top front of the grip, the mark on the left side.">\n  ' + '\n  '.join(o) + '\n</svg>')
form = Path(__file__).resolve().parent.parent / 'src' / 'components' / 'cassvision' / 'Form.astro'
page = form.read_text()
indented = '\n'.join('      ' + line for line in svg.splitlines())
new, n = re.subn(r'      <svg viewBox=.*?</svg>', lambda m: indented, page, count=1, flags=re.S)
if not n:
    sys.exit(f'{form}: no <svg> to replace')
form.write_text(new)
print(f'wrote the drawing into {form} (overall {glass_rear - ring_front:.1f} x {c.BODY_H - cap_bot:.1f} mm)')
