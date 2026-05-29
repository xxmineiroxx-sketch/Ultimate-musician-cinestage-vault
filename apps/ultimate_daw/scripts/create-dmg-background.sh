#!/bin/bash
# Creates a dark DMG background image for the Ultimate Musician installer
# Styled like professional DAW installers (dark, minimal, with drag arrow)
# Requires: ImageMagick (convert) OR Python 3 (Pillow or stdlib)

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="$PROJECT_ROOT/assets/dmg-background.png"
WIDTH=660
HEIGHT=400

echo "Creating DMG background at $OUTPUT..."

# Method 1: Try ImageMagick
if command -v convert &>/dev/null; then
  echo "Using ImageMagick..."
  convert -size "${WIDTH}x${HEIGHT}" xc:"#02061700" \
    -fill "#1e293b" -draw "rectangle 328,0 332,400" \
    -fill "#64748b" -font Helvetica -pointsize 14 \
    -draw "text 130,355 'Drag to install'" \
    -draw "text 440,355 'Applications'" \
    "$OUTPUT"
  echo "Done (ImageMagick): $OUTPUT"
  exit 0
fi

# Method 2: Try Python with Pillow
if python3 -c "from PIL import Image" 2>/dev/null; then
  echo "Using Python + Pillow..."
  python3 - <<'PYEOF'
import os, sys
sys.path.insert(0, '')
from PIL import Image, ImageDraw

img = Image.new('RGB', (660, 400), color=(2, 6, 23))
draw = ImageDraw.Draw(img)
# Subtle vertical divider line
draw.rectangle([329, 0, 331, 400], fill=(30, 41, 59))
# Labels
draw.text((180, 345), 'Drag to install', fill=(100, 116, 139))
draw.text((456, 345), 'Applications', fill=(100, 116, 139))
out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'dmg-background.png')
img.save(out)
print(f'Done (Pillow): {out}')
PYEOF
  exit 0
fi

# Method 3: Pure Python stdlib (no dependencies)
echo "Using pure Python stdlib..."
python3 - <<'PYEOF'
import struct, zlib, os

def make_png(w, h, bg_color):
    def chunk(tag, data):
        buf = tag + data
        return struct.pack('>I', len(data)) + buf + struct.pack('>I', zlib.crc32(buf) & 0xffffffff)

    # IHDR
    ihdr_data = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)

    # Build raw image rows (filter byte 0 = None per scanline)
    rows = []
    r, g, b = bg_color
    for y in range(h):
        row = bytearray([0])  # filter byte
        for x in range(w):
            # Subtle divider line at x=329-331
            if 329 <= x <= 331:
                row += bytes([30, 41, 59])
            else:
                row += bytes([r, g, b])
        rows.append(bytes(row))

    raw = b''.join(rows)
    idat_data = zlib.compress(raw, 9)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', ihdr_data)
    png += chunk(b'IDAT', idat_data)
    png += chunk(b'IEND', b'')
    return png

out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'dmg-background.png')
with open(out, 'wb') as f:
    f.write(make_png(660, 400, (2, 6, 23)))
print(f'Done (stdlib): {out}')
PYEOF
