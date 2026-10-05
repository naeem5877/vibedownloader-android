import struct, glob, sys

def aligns(d):
    if d[:4] != b'\x7fELF':
        return None
    if d[4] == 2:
        e = struct.unpack_from('<Q', d, 0x20)[0]
        s, n = struct.unpack_from('<HH', d, 0x36)
        base, fmt = 0x30, '<Q'
    else:
        e = struct.unpack_from('<I', d, 0x1c)[0]
        s, n = struct.unpack_from('<HH', d, 0x2a)
        base, fmt = 0x1c, '<I'
    out = []
    for i in range(n):
        off = e + i * s
        if off + 4 > len(d):
            break
        if struct.unpack_from('<I', d, off)[0] == 1:
            out.append(struct.unpack_from(fmt, d, off + base)[0])
    return out or None

bad = []
checked = 0

def label_of(p):
    return p.replace('\\', '/')

targets = (
    [(label_of(p).split('jniLibs/')[1], p)
     for p in glob.glob(r'android/app/src/main/jniLibs/*/*.so')]
    + [('webp16k/' + label_of(p).split('assets/webp16k/')[1], p)
       for p in glob.glob(r'android/app/src/main/assets/webp16k/*/*.so')]
)

for label, path in sorted(targets):
    a = aligns(open(path, 'rb').read())
    checked += 1
    if a is None:
        bad.append(label + ' (not ELF)')
    elif min(a) < 16384:
        bad.append('%s (min p_align=%d)' % (label, min(a)))

print('checked %d native libraries' % checked)
if bad:
    print('FAIL: not 16 KB aligned')
    for b in bad:
        print('  ' + b)
    sys.exit(1)
print('PASS: every committed native library has 16 KB aligned PT_LOAD segments')