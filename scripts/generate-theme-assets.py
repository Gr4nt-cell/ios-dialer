#!/usr/bin/env python3
"""Rebuild bundled pastel wallpapers and monochrome dock icons (Pillow + NumPy).
Assets are deterministic gradients/geometric glyphs, with no online runtime dependency.
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets'
(ASSETS / 'wallpapers').mkdir(exist_ok=True)
(ASSETS / 'dock').mkdir(exist_ok=True)

# Wide, soft colour fields keep both phone and tablet content readable.
PALETTES = {
 'mint': ((242,249,245), (181,218,208), (205,219,246), (218,237,199)),
 'rose-glass': ((252,245,247), (239,202,215), (235,218,239), (250,226,212)),
 'lavender-mist': ((247,247,252), (219,206,239), (210,224,245), (234,229,245)),
 'peach-bloom': ((253,248,241), (245,215,193), (248,232,220), (238,230,204)),
 'ocean-mint': ((241,249,249), (184,220,222), (205,226,244), (211,237,225)),
 'cotton-candy': ((252,247,252), (239,213,233), (209,226,246), (243,225,237)),
 'soft-sage': ((245,249,241), (204,223,199), (221,233,219), (231,234,208)),
 'sunrise-glow': ((253,248,241), (246,218,193), (244,228,227), (244,235,200)),
 'bluebell': ((245,248,253), (204,219,242), (223,218,243), (219,235,240)),
 'mint-pearl': ((248,252,249), (213,234,224), (229,238,245), (233,240,222)),
}

def wallpaper(palette, dark=False):
 h,w=1920,1280
 yy,xx=np.mgrid[0:h,0:w].astype(np.float32)
 xx=xx/w*390; yy=yy/h*844
 base,left,right,bottom=palette
 if dark:
  # A quiet charcoal base with the same hue family; no saturated neon blobs.
  base=(13,23,22)
  left=tuple(int(c*.18) for c in left)
  right=tuple(int(c*.19) for c in right)
  bottom=tuple(int(c*.15) for c in bottom)
 out=np.empty((h,w,3),dtype=np.float32);out[:]=base
 for cx,cy,col,spread,opacity in [(10,70,left,250,.55),(370,220,right,220,.35),(100,650,bottom,310,.55)]:
  t=(np.exp(-((xx-cx)**2+(yy-cy)**2)/(2*spread*spread))*opacity)[...,None]
  out=out*(1-t)+np.array(col)*t
 # Subpixel dithering keeps large, pale gradients smooth at low file sizes.
 out+=np.random.default_rng(20261106).uniform(-.45,.45,(h,w,1))
 return Image.fromarray(np.clip(np.rint(out),0,255).astype(np.uint8))

for name,palette in PALETTES.items():
 light_path=ASSETS/'dialer-gradient-background.jpg' if name=='mint' else ASSETS/'wallpapers'/f'{name}.png'
 image=wallpaper(palette)
 if light_path.suffix=='.jpg':image.save(light_path,quality=96,subsampling=0,optimize=True)
 else:image.save(light_path,optimize=True)
 wallpaper(palette,True).save(ASSETS/'wallpapers'/f'{name}-dark.jpg',quality=94,subsampling=0,optimize=True)

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
print('Generated 20 wallpapers and four dock masks.')
