#!/usr/bin/env python3
"""Rebuild monochrome dock icons (Pillow + NumPy).
Assets are deterministic gradients/geometric glyphs, with no online runtime dependency.
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets'
(ASSETS / 'dock').mkdir(exist_ok=True)

# Wallpapers are generated assets in assets/wallpapers-glass; their prompts are saved
# alongside the collection. This helper now regenerates only the dock masks.
# Supersampled monochrome masks: tintColor supplies theme/selection colour at runtime.
N=512
for name in ['calls','contacts','keypad','search']:
 icon=Image.new('RGBA',(N,N));d=ImageDraw.Draw(icon)
 def point(x,y):return (x*N/32,y*N/32)
 def box(x1,y1,x2,y2):return tuple(v*N/32 for v in [x1,y1,x2,y2])
 stroke=round(1.7*N/32)
 if name=='calls':
  font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',440)
  bounds=font.getbbox('☎');mask=Image.new('RGBA',(bounds[2]-bounds[0],bounds[3]-bounds[1]));ImageDraw.Draw(mask).text((-bounds[0],-bounds[1]),'☎',font=font,fill='white')
  mask.thumbnail((N-20,N-20),Image.Resampling.LANCZOS);icon.alpha_composite(mask,((N-mask.width)//2,(N-mask.height)//2))
 elif name=='contacts':
  d.ellipse(box(10.1,2.7,21.9,14.5),outline='white',width=stroke)
  # Open shoulder outline, rather than the old enclosing circle.
  pts=[]
  for theta in np.linspace(np.pi,2*np.pi,120):
   pts.append(point(16+12*np.cos(theta),29+11.5*np.sin(theta)))
  d.line(pts,fill='white',width=stroke,joint='curve')
 elif name=='keypad':
  for y in [7,16,25]:
   for x in [7,16,25]:d.ellipse(box(x-2.05,y-2.05,x+2.05,y+2.05),fill='white')
 else:
  d.ellipse(box(3,3,23,23),outline='white',width=stroke)
  d.line([point(21.1,21.1),point(29,29)],fill='white',width=stroke)
  d.ellipse(box(28.15,28.15,29.85,29.85),fill='white')
 icon.resize((192,192),Image.Resampling.LANCZOS).save(ASSETS/'dock'/f'{name}.png')
print('Regenerated four dock masks. Wallpaper artwork is unchanged.')
