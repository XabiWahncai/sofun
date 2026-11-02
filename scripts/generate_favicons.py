import base64
from PIL import Image, ImageDraw

# Load base logo
base_path = 'public/logo.png'
im = Image.open(base_path).convert('RGBA')
w, h = im.size

# 1. Generate ultra-smooth anti-aliased circular mask
scale = 4
mask = Image.new('L', (w * scale, h * scale), 0)
draw = ImageDraw.Draw(mask)
draw.ellipse((0, 0, w * scale - 1, h * scale - 1), fill=255)
mask = mask.resize((w, h), Image.Resampling.LANCZOS)

circular = im.copy()
circular.putalpha(mask)

# Save master circular logo
circular.save('public/logo-circle.png', 'PNG')
circular.save('public/logo.png', 'PNG')

# 2. Multi-resolution ICO (16, 32, 48, 64, 128, 256) with transparency
ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
circular.save('public/favicon.ico', format='ICO', sizes=ico_sizes)

# 3. Google Search and standard browser icons
for sz in [16, 32, 48, 96, 144, 192]:
    resized = circular.resize((sz, sz), Image.Resampling.LANCZOS)
    resized.save(f'public/favicon-{sz}x{sz}.png', 'PNG')

# 4. Apple Touch Icon (180x180 circular)
apple_icon = circular.resize((180, 180), Image.Resampling.LANCZOS)
apple_icon.save('public/apple-touch-icon.png', 'PNG')

# 5. PWA icons (512x512 and 192x192 circular)
icon_512 = circular.resize((512, 512), Image.Resampling.LANCZOS)
icon_512.save('public/icon-512.png', 'PNG')

icon_192 = circular.resize((192, 192), Image.Resampling.LANCZOS)
icon_192.save('public/icon-192.png', 'PNG')

# 6. Generate public/favicon.svg with circular clipping and base64 image
with open('public/icon-512.png', 'rb') as f:
    b64 = base64.b64encode(f.read()).decode('utf-8')

svg_str = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <clipPath id="circle-clip">
      <circle cx="256" cy="256" r="256" />
    </clipPath>
  </defs>
  <image href="data:image/png;base64,{b64}" width="512" height="512" clip-path="url(#circle-clip)" />
</svg>'''

with open('public/favicon.svg', 'w', encoding='utf-8') as f:
    f.write(svg_str)

print('All circular favicons and icons generated successfully!')
