import base64
from PIL import Image

src_path = r'C:/Users/USER/.gemini/antigravity/brain/06f5b611-5311-4237-be9f-78ad01d5d8d1/.user_uploaded/media_1793167411277_21eadad2.png'
im = Image.open(src_path).convert('RGBA')

# 1. Full-bleed square versions (official branding, Google Search, Apple Touch Icon)
im.save('public/logo.png', 'PNG')
im.convert('RGB').save('public/logo.jpg', 'JPEG', quality=95)

# 2. Multi-resolution ICO (16, 32, 48, 64, 128, 256)
im.save('public/favicon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

# 3. Google Search and standard browser icons (multiples of 48px: 48, 96, 144, 192, plus 16, 32)
for sz in [16, 32, 48, 96, 144, 192]:
    resized = im.resize((sz, sz), Image.Resampling.LANCZOS)
    resized.save(f'public/favicon-{sz}x{sz}.png', 'PNG')

# 4. Apple Touch Icon (180x180, square, no transparency required by Apple)
apple_icon = im.resize((180, 180), Image.Resampling.LANCZOS)
apple_icon.save('public/apple-touch-icon.png', 'PNG')

# 5. PWA icons
icon_512 = im.resize((512, 512), Image.Resampling.LANCZOS)
icon_512.save('public/icon-512.png', 'PNG')

icon_192 = im.resize((192, 192), Image.Resampling.LANCZOS)
icon_192.save('public/icon-192.png', 'PNG')

# 6. Generate public/favicon.svg
with open('public/icon-512.png', 'rb') as f:
    b64 = base64.b64encode(f.read()).decode('utf-8')

svg_str = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%"><image href="data:image/png;base64,{b64}" width="512" height="512" /></svg>'
with open('public/favicon.svg', 'w', encoding='utf-8') as f:
    f.write(svg_str)

print('All full-bleed Google Search compliant favicons generated successfully!')
