"""Writes the synthetic JPEG inputs of this fixture (run once; the JPEGs are
committed and the capture decodes the committed files, so the fixture does not
depend on the encoders' versions). Encoders: libjpeg-turbo 3.2.0 cjpeg and
ImageMagick 7.1.2-19 (for the four-component files: it writes YCCK, Adobe
transform 2; the CMYK (transform 0) and no-Adobe-segment variants patch that
file's APP14 segment). The source pictures are
synthetic: a gradient with hard edges and a pseudo-random texture, so the
IDCT, the upsamplers and the colour conversions all see varied data.

Run: python3.12 -I make_jpegs.py   (from this directory)
"""
import pathlib
import subprocess
import tempfile

HERE = pathlib.Path(__file__).resolve().parent


def lcg(seed):
    state = seed
    while True:
        state = (state * 1103515245 + 12345) & 0x7fffffff
        yield state >> 8


def picture(w, h, seed, gray=False):
    rand = lcg(seed)
    rows = []
    for y in range(h):
        row = []
        for x in range(w):
            r = (x * 255 // max(1, w - 1)) if x < w * 2 // 3 else 255 - (y * 7 % 256)
            g = (y * 255 // max(1, h - 1)) ^ (64 if (x // 4 + y // 4) % 2 else 0)
            b = next(rand) & 255
            if gray:
                row.append((r * 77 + g * 150 + b * 29) >> 8)
            else:
                row += [r, g, b]
        rows.append(bytes(row))
    head = (b'P5' if gray else b'P6') + f'\n{w} {h}\n255\n'.encode()
    return head + b''.join(rows)


def cjpeg(name, w, h, seed, *args, gray=False):
    with tempfile.TemporaryDirectory() as tmp:
        src = pathlib.Path(tmp) / ('in.pgm' if gray else 'in.ppm')
        src.write_bytes(picture(w, h, seed, gray))
        out = subprocess.check_output(['cjpeg', *args, str(src)])
    (HERE / name).write_bytes(out)


def magick(name, w, h, seed, *args):
    with tempfile.TemporaryDirectory() as tmp:
        src = pathlib.Path(tmp) / 'in.ppm'
        src.write_bytes(picture(w, h, seed))
        subprocess.check_call(['magick', str(src), *args, str(HERE / name)])


cjpeg('rgb-420.jpg', 37, 23, 1, '-quality', '85')
cjpeg('rgb-422.jpg', 37, 23, 2, '-quality', '85', '-sample', '2x1')
cjpeg('rgb-440.jpg', 37, 23, 3, '-quality', '85', '-sample', '1x2')
cjpeg('rgb-444.jpg', 37, 23, 4, '-quality', '85', '-sample', '1x1')
cjpeg('rgb-411.jpg', 37, 23, 5, '-quality', '85', '-sample', '4x1')
cjpeg('rgb-420-progressive.jpg', 41, 29, 6, '-quality', '80', '-progressive')
cjpeg('rgb-444-progressive.jpg', 33, 17, 7, '-quality', '92', '-sample', '1x1', '-progressive', '-optimize')
cjpeg('rgb-restart.jpg', 40, 24, 8, '-quality', '75', '-restart', '1B')
cjpeg('rgb-restart-progressive.jpg', 40, 24, 9, '-quality', '75', '-restart', '2B', '-progressive')
cjpeg('rgb-components.jpg', 21, 13, 10, '-quality', '90', '-rgb')
cjpeg('rgb-q100.jpg', 16, 16, 11, '-quality', '100')
cjpeg('rgb-q5.jpg', 19, 11, 12, '-quality', '5')
cjpeg('rgb-1x1.jpg', 1, 1, 13, '-quality', '85')
cjpeg('rgb-1x9.jpg', 1, 9, 14, '-quality', '85')
cjpeg('rgb-9x1.jpg', 9, 1, 15, '-quality', '85')
cjpeg('gray.jpg', 35, 21, 16, '-quality', '85', gray=True)
cjpeg('gray-progressive.jpg', 35, 21, 17, '-quality', '85', '-progressive', gray=True)
cjpeg('err-12bit.jpg', 16, 16, 18, '-precision', '12')
cjpeg('err-arithmetic.jpg', 16, 16, 19, '-arithmetic')
magick('ycck.jpg', 27, 19, 20, '-colorspace', 'CMYK', '-quality', '85')
ycck = (HERE / 'ycck.jpg').read_bytes()
adobe = ycck.index(b'Adobe\0')
assert ycck[adobe + 11] == 2, 'expected an Adobe YCCK file'
(HERE / 'cmyk.jpg').write_bytes(ycck[:adobe + 11] + b'\0' + ycck[adobe + 12:])
(HERE / 'cmyk-no-adobe.jpg').write_bytes(ycck[:adobe] + b'Xdobe' + ycck[adobe + 5:])
# A baseline JPEG cut off inside its entropy-coded data: stb decodes what is
# there (stbi__grow_buffer_unsafe pads with zeros) and succeeds.
full = (HERE / 'rgb-420.jpg').read_bytes()
(HERE / 'truncated.jpg').write_bytes(full[:len(full) * 2 // 3])
