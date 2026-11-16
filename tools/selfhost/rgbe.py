import numpy as np
def write_hdr_rle(path, rgb):
    """rgb: HxWx3 float32 (RGB order, top row first). Radiance RGBE with new-style RLE scanlines."""
    h, w, _ = rgb.shape
    m = rgb.max(axis=2)
    e = np.zeros_like(m, dtype=np.int32); mant = np.zeros_like(m)
    nz = m > 1e-32
    mant[nz], e[nz] = np.frexp(m[nz])
    scale = np.zeros_like(m); scale[nz] = mant[nz] * 256.0 / m[nz]
    rgbe = np.zeros((h, w, 4), np.uint8)
    rgbe[..., :3] = np.clip(rgb * scale[..., None], 0, 255).astype(np.uint8)
    rgbe[..., 3] = np.where(nz, e + 128, 0).astype(np.uint8)
    out = bytearray(b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n' + f'-Y {h} +X {w}\n'.encode())
    for y in range(h):
        out += bytes([2, 2, w >> 8, w & 255])
        for c in range(4):
            d = rgbe[y, :, c]; i = 0
            while i < w:
                # run?
                j = i
                while j < w and j - i < 127 and d[j] == d[i]: j += 1
                if j - i >= 4:
                    out += bytes([128 + j - i, d[i]]); i = j; continue
                # literal until a run of >=4 starts
                k = i
                while k < w and k - i < 128:
                    if k + 3 < w and d[k] == d[k+1] == d[k+2] == d[k+3]: break
                    k += 1
                out += bytes([k - i]) + d[i:k].tobytes(); i = k
    open(path, 'wb').write(out)
