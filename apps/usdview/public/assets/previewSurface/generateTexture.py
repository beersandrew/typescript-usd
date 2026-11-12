# Deterministic 2x2 RGBA checker: red/green, blue/white. Standard library only.
from pathlib import Path
import struct, zlib

def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))

rgba = bytes([255,0,0,255, 0,255,0,255, 0,0,255,255, 255,255,255,255])
scanlines = b'\0' + rgba[:8] + b'\0' + rgba[8:]
(Path(__file__).parent / 'nested/texture.png').write_bytes(
    b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB',2,2,8,6,0,0,0))
    + chunk(b'IDAT', zlib.compress(scanlines)) + chunk(b'IEND', b''))
