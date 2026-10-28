import base64
from PIL import Image, ImageDraw

src_path = r'C:/Users/USER/.gemini/antigravity/brain/06f5b611-5311-4237-be9f-78ad01d5d8d1/.user_uploaded/media_1793167411277_21eadad2.png'
im = Image.open(src_path).convert('RGBA')

# 1. Circular cropped version (for browser tabs and apple touch icons)
size = im.size
scale = 2
mask_size = (size[0] * scale, size[1] * scale)
mask_high = Image.new('L', mask_size, 0)
draw = ImageDraw.Draw(mask_high)
draw.ellipse((0, 0, mask_size[0] - 1, mask_size[1] - 1), fill=255)
mask = mask_high.resize(size, Image.Resampling.LANCZOS)

circular_im = Image.new('RGBA', size, (0, 0, 0, 0))
circular_im.paste(im, (0, 0))
circular_im.putalpha(mask)

# Save circular icons
circular_im.save('public/logo-circle.png', 'PNG')
circular_im.save('public/logo.png', 'PNG')

# 2. Multi-resolution ICO (16, 32, 48, 64, 128, 256)
circular_im.save('public/favicon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

# 3. Google Search multiples of 48px (48x48, 96x96, 144x144, 192x192)
for sz in [48, 96, 144, 192]:
    resized = circular_im.resize((sz, sz), Image.Resampling.LANCZOS)
    resized.save(f'public/favicon-{sz}x{sz}.png', 'PNG')

# 4. Standard PWA and Apple icons
apple_icon = circular_im.resize((180, 180), Image.Resampling.LANCZOS)
apple_icon.save('public/apple-touch-icon.png', 'PNG')

icon_512 = circular_im.resize((512, 512), Image.Resampling.LANCZOS)
icon_512.save('public/icon-512.png', 'PNG')

icon_192 = circular_im.resize((192, 192), Image.Resampling.LANCZOS)
icon_192.save('public/icon-192.png', 'PNG')

# 5. Generate public/favicon.svg (Crucial: Googlebot cached Content-Location: /favicon.svg)
with open('public/icon-512.png', 'rb') as f:
    b64 = base64.b64encode(f.read()).decode('utf-8')

svg_str = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%"><image href="data:image/png;base64,{b64}" width="512" height="512" /></svg>'
with open('public/favicon.svg', 'w', encoding='utf-8') as f:
    f.write(svg_str)

print('All favicons generated successfully!')
