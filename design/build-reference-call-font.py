"""Bundle the reference's text symbols so Android cannot substitute different emoji/icons.
Usage: python build-reference-call-font.py --text-font FONT --symbol-font FONT --output TTF
The build consumes the committed TTF directly; Python is not required for Android builds.
"""
import argparse
from fontTools.ttLib import TTFont
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.recordingPen import DecomposingRecordingPen

p = argparse.ArgumentParser()
p.add_argument('--text-font', required=True)
p.add_argument('--symbol-font', required=True)
p.add_argument('--output', required=True)
a = p.parse_args()
fonts = [TTFont(a.text_font), TTFont(a.symbol_font)]
chars = sorted(set(range(32, 127)) | {ord(c) for c in '♙▤◉◖Ⅱ♩⠿☎⌄'})
units = 1000
builder = FontBuilder(units, isTTF=True)
glyphs = {}; metrics = {}; cmap = {}
empty = TTGlyphPen(None); glyphs['.notdef'] = empty.glyph(); metrics['.notdef'] = (500, 0)
for code in chars:
    font = next((f for f in fonts if code in f.getBestCmap()), None)
    if font is None: raise ValueError(f'Missing U+{code:04X}')
    source_name = font.getBestCmap()[code]; name = f'uni{code:04X}'
    source = font.getGlyphSet(); pen = TTGlyphPen(None)
    scale = units / font['head'].unitsPerEm
    # CFF text fonts have cubic curves; convert them without rasterizing.
    out = TransformPen(Cu2QuPen(pen, max_err=0.5, reverse_direction=False), (scale, 0, 0, scale, 0, 0))
    recording = DecomposingRecordingPen(source)
    source[source_name].draw(recording)
    recording.replay(out)
    glyphs[name] = pen.glyph()
    width, lsb = font['hmtx'].metrics[source_name]
    metrics[name] = (round(width * scale), round(lsb * scale)); cmap[code] = name
builder.setupGlyphOrder(list(glyphs)); builder.setupCharacterMap(cmap)
builder.setupGlyf(glyphs); builder.setupHorizontalMetrics(metrics)
builder.setupHorizontalHeader(ascent=905, descent=-212)
builder.setupNameTable({'familyName':'Call Screen Reference','styleName':'Regular','uniqueFontIdentifier':'CallScreenReference-1','fullName':'Call Screen Reference Regular','psName':'CallScreenReference-Regular','version':'Version 1.0'})
builder.setupOS2(sTypoAscender=905, sTypoDescender=-212, usWinAscent=1000, usWinDescent=250)
builder.setupPost(); builder.setupMaxp(); builder.save(a.output)
print(f'Wrote {a.output}: {len(cmap)} vector glyphs')
