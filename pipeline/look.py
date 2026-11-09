# Look C: grade + background swap onto a blurred office plate, frame by frame.
# usage: .venv/bin/python pipeline/look.py in.mp4 <plate.png | none> out.mp4
# plate = a background image (office, brand backdrop). 'none' = grade only, keep the real background.
import sys, os, subprocess, json
import numpy as np
from PIL import Image, ImageFilter
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'vendor', 'effects', 'scripts'))
import fx

src, plate_path, out = sys.argv[1:4]
KEEP_BG = plate_path == 'none'
pr = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate',
                                '-of', 'json', src], capture_output=True, text=True).stdout)['streams'][0]
W, H = pr['width'], pr['height']; num, den = map(int, pr['r_frame_rate'].split('/')); fps = num / den

pl = Image.new('RGB', (W, H)) if KEEP_BG else Image.open(plate_path).convert('RGB')
r = max(W / pl.width, H / pl.height); pl = pl.resize((int(pl.width * r) + 1, int(pl.height * r) + 1), Image.LANCZOS)
l = (pl.width - W) // 2; pl = pl.crop((l, 0, l + W, H)).filter(ImageFilter.GaussianBlur(6))
BG = np.clip(np.asarray(pl).astype(np.float32) / 255 * 0.92, 0, 1)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)

def grade(a, cx, cy, fw):
    a = a + 0.16 * (1 - a) ** 3
    a = np.clip((a - 0.5) * 1.06 + 0.52, 0, 1)
    a[..., 0] *= 1.03; a[..., 2] *= 0.97
    d = ((xx - cx) / (fw * 1.9)) ** 2 + ((yy - cy) / (fw * 2.1)) ** 2
    fill = np.exp(-d)[..., None]
    side = np.clip((xx - cx) / (fw * 0.9) + 0.6, 0, 1)[..., None]   # stronger on the shadow side (viewer's right)
    return np.clip(a + fill * side * 0.16 * (1 - a), 0, 1)

dec = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(fps), '-i', '-',
                        '-i', src, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-crf', '14', '-preset', 'medium', '-pix_fmt', 'yuv420p',
                        '-g', '30', '-c:a', 'copy', '-shortest', out], stdin=subprocess.PIPE)
tr = fx.Tracker(W, H)
face = (W * 0.38, H * 0.33, W * 0.22); n = 0; size = W * H * 3
while True:
    buf = dec.stdout.read(size)
    if len(buf) < size: break
    rgb = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
    m, f = tr(rgb.copy(), int(n * 1000 / fps))
    if f is not None:  # smooth the face position so the fill light doesn't jitter
        face = tuple(0.85 * p + 0.15 * q for p, q in zip(face, f))
    a = grade(rgb.astype(np.float32) / 255, *face)
    mm = (m.astype(np.float32) / 255)[..., None]
    o = a if KEEP_BG else a * mm + BG * (1 - mm)
    enc.stdin.write((o * 255 + 0.5).astype(np.uint8).tobytes())
    n += 1
    if n % 300 == 0: print('frames', n, flush=True)
enc.stdin.close(); enc.wait(); dec.wait()
print('done', n, 'frames')
