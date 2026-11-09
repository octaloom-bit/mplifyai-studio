# Overlay photo cards (rounded, framed, soft shadow, fade + slow zoom) on a video.
# usage: python3 broll_cards.py in.mp4 out.mp4 card.png:start:dur [card.png:start:dur ...]
import sys, subprocess, json, os, tempfile
from PIL import Image, ImageDraw, ImageFilter

src, out, *specs = sys.argv[1:]
pr = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', src],
                               capture_output=True, text=True).stdout)['streams'][0]
W, H = pr['width'], pr['height']; FPS = 30
tmp = tempfile.mkdtemp()

def card_frames(path, dur, tag):
    img = Image.open(path).convert('RGB')
    cw = int(W * 0.82); ch = int(cw * img.height / img.width)
    if ch > int(H * 0.55): ch = int(H * 0.55); cw = int(ch * img.width / img.height)
    pad, border, rad = 60, 10, 26
    n = int(dur * FPS)
    for i in range(n):
        t = i / FPS
        a = min(1, t / 0.25, (dur - t) / 0.25)                 # fade in/out
        z = 1.0 + 0.06 * (t / dur)                              # slow zoom inside the frame
        rise = int(24 * (1 - min(1, t / 0.35)))                 # small upward drift on entry
        iw, ih = int(cw * z), int(ch * z)
        inner = img.resize((iw, ih), Image.LANCZOS).crop(((iw - cw) // 2, (ih - ch) // 2, (iw - cw) // 2 + cw, (ih - ch) // 2 + ch))
        frame = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        x0 = (W - cw) // 2; y0 = (H - ch) // 2 - int(H * 0.06) + rise
        sh = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(sh)
        d.rounded_rectangle((x0 - border, y0 - border + 14, x0 + cw + border, y0 + ch + border + 14), rad + border, fill=(0, 0, 0, 110))
        frame = Image.alpha_composite(frame, sh.filter(ImageFilter.GaussianBlur(22)))
        fr = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(fr)
        d.rounded_rectangle((x0 - border, y0 - border, x0 + cw + border, y0 + ch + border), rad + border, fill=(248, 250, 252, 255))
        mask = Image.new('L', (cw, ch), 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, cw, ch), rad, fill=255)
        fr.paste(inner, (x0, y0), mask)
        frame = Image.alpha_composite(frame, fr)
        if a < 1: frame.putalpha(frame.getchannel('A').point(lambda v: int(v * a)))
        frame.save(os.path.join(tmp, f'{tag}_{i:04d}.png'))
    return os.path.join(tmp, f'{tag}_%04d.png')

inputs, chains, last = ['-i', src], [], 'base'
wins = [(sp.rsplit(':', 2)[0], float(sp.rsplit(':', 2)[1]), float(sp.rsplit(':', 2)[2])) for sp in specs]
chains.append(f'[0:v]split={len(wins) + 1}[base]' + ''.join(f'[b{k}]' for k in range(len(wins))))
for k, (path, start, dur) in enumerate(wins):
    # the speaker goes blurred + dimmed behind the card, fading with it
    chains.append(f'[b{k}]gblur=sigma=28,eq=brightness=-0.10:saturation=0.85,format=yuva420p,'
                  f'fade=t=in:st={start}:d=0.25:alpha=1,fade=t=out:st={start + dur - 0.25}:d=0.25:alpha=1[bl{k}]')
    chains.append(f'[{last}][bl{k}]overlay=0:0[m{k}]'); last = f'm{k}'
for k, (path, start, dur) in enumerate(wins):
    pat = card_frames(path, dur, f'c{k}')
    inputs += ['-framerate', str(FPS), '-i', pat]
    chains.append(f'[{k + 1}:v]setpts=PTS+{start}/TB[o{k}];[{last}][o{k}]overlay=0:0:eof_action=pass[v{k}]')
    last = f'v{k}'
subprocess.run(['ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex', ';'.join(chains), '-map', f'[{last}]', '-map', '0:a',
                '-c:v', 'libx264', '-crf', '14', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'copy', out], check=True)
print('done', out)
