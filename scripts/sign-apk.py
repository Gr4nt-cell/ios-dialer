#!/usr/bin/env python3
"""
Sign an APK with the upload key (APK Signature Scheme v2), without the Android SDK.

The CI build comes out debug-signed when the signing secrets aren't set. This drops that
signature, zip-aligns the APK again (4 bytes for stored files, 16 KB for native libraries) and
signs it with APK Signature Scheme v2, which every Android version the app supports (7.0+)
verifies. It needs only Python 3 and the `cryptography` package.

    ANDROID_KEYSTORE_PASSWORD=... python3 scripts/sign-apk.py <in.apk> <upload.keystore> <out.apk>

The keystore must be PKCS12 (keytool's default). The key never leaves the machine running this.
"""
import hashlib
import os
import struct
import sys
import zlib

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa, ec
from cryptography.hazmat.primitives.serialization import pkcs12

CHUNK = 1024 * 1024
V2_ID = 0x7109871A
PAD_ID = 0x42726577


def u32(n):
    return struct.pack('<I', n)


def lp(b):  # uint32 length-prefixed
    return u32(len(b)) + b


# ---------------------------------------------------------------- zip rewrite + align
def read_entries(data):
    eocd = data.rfind(b'PK\x05\x06')
    if eocd < 0:
        sys.exit('not a zip file')
    n, cd_size, cd_off = struct.unpack('<HII', data[eocd + 10:eocd + 20])
    entries, p = [], cd_off
    for _ in range(n):
        if data[p:p + 4] != b'PK\x01\x02':
            sys.exit('bad central directory')
        (ver_made, ver_need, flags, method, mtime, mdate, crc, csize, usize, nlen, xlen, clen,
         disk, iattr, eattr, loff) = struct.unpack('<HHHHHHIIIHHHHHII', data[p + 4:p + 46])
        name = data[p + 46:p + 46 + nlen]
        cextra = data[p + 46 + nlen:p + 46 + nlen + xlen]
        comment = data[p + 46 + nlen + xlen:p + 46 + nlen + xlen + clen]
        p += 46 + nlen + xlen + clen
        lnlen, lxlen = struct.unpack('<HH', data[loff + 26:loff + 30])
        start = loff + 30 + lnlen + lxlen
        entries.append(dict(ver_made=ver_made, ver_need=ver_need, flags=flags & ~0x08, method=method,
                            mtime=mtime, mdate=mdate, crc=crc, csize=csize, usize=usize, name=name,
                            cextra=cextra, comment=comment, iattr=iattr, eattr=eattr,
                            body=data[start:start + csize]))
    return entries


def is_old_signature(name):
    n = name.decode('utf-8', 'replace')
    if not n.startswith('META-INF/'):
        return False
    base = n[len('META-INF/'):]
    if '/' in base:
        return False
    return base == 'MANIFEST.MF' or base.upper().endswith(('.SF', '.RSA', '.DSA', '.EC'))


def build_zip(entries):
    out = bytearray()
    cd = bytearray()
    for e in entries:
        off = len(out)
        name = e['name']
        extra = b''
        if e['method'] == 0:  # stored: align the data
            align = 16384 if name.endswith(b'.so') else 4
            data_at = off + 30 + len(name)
            padlen = (-data_at) % align
            if padlen:
                # Android's zipalign extra field (0xd935) carries the padding
                while padlen < 6:
                    padlen += align
                extra = struct.pack('<HHH', 0xD935, padlen - 4, align) + b'\0' * (padlen - 6)
        out += b'PK\x03\x04' + struct.pack('<HHHHHIIIHH', e['ver_need'], e['flags'], e['method'],
                                            e['mtime'], e['mdate'], e['crc'], e['csize'],
                                            e['usize'], len(name), len(extra))
        out += name + extra + e['body']
        cd += b'PK\x01\x02' + struct.pack('<HHHHHHIIIHHHHHII', e['ver_made'], e['ver_need'],
                                          e['flags'], e['method'], e['mtime'], e['mdate'],
                                          e['crc'], e['csize'], e['usize'], len(name), 0,
                                          len(e['comment']), 0, e['iattr'], e['eattr'], off)
        cd += name + e['comment']
    eocd = b'PK\x05\x06' + struct.pack('<HHHHIIH', 0, 0, len(entries), len(entries), len(cd),
                                       len(out), 0)
    return bytes(out), bytes(cd), eocd


# ---------------------------------------------------------------- v2 signing
def chunked_digest(sections):
    digests = []
    for s in sections:
        for i in range(0, len(s), CHUNK):
            c = s[i:i + CHUNK]
            digests.append(hashlib.sha256(b'\xa5' + u32(len(c)) + c).digest())
    return hashlib.sha256(b'\x5a' + u32(len(digests)) + b''.join(digests)).digest()


def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    src, ks_path, dst = sys.argv[1:]
    password = os.environ.get('ANDROID_KEYSTORE_PASSWORD')
    if not password:
        import getpass
        password = getpass.getpass('Keystore password: ')
    key, cert, _ = pkcs12.load_key_and_certificates(open(ks_path, 'rb').read(), password.encode())

    if isinstance(key, rsa.RSAPrivateKey):
        algo = 0x0103  # RSASSA-PKCS1-v1_5 with SHA2-256
        sign = lambda m: key.sign(m, padding.PKCS1v15(), hashes.SHA256())
    elif isinstance(key, ec.EllipticCurvePrivateKey):
        algo = 0x0201  # ECDSA with SHA2-256
        sign = lambda m: key.sign(m, ec.ECDSA(hashes.SHA256()))
    else:
        sys.exit('unsupported key type')

    entries = [e for e in read_entries(open(src, 'rb').read()) if not is_old_signature(e['name'])]
    for e in entries:  # sanity: the stored bodies are intact
        if e['method'] == 0 and zlib.crc32(e['body']) & 0xFFFFFFFF != e['crc']:
            sys.exit('CRC mismatch in ' + e['name'].decode())
    body, cd, eocd = build_zip(entries)

    digest = chunked_digest([body, cd, eocd])
    cert_der = cert.public_bytes(serialization.Encoding.DER)
    pub = key.public_key().public_bytes(serialization.Encoding.DER,
                                        serialization.PublicFormat.SubjectPublicKeyInfo)
    signed_data = lp(lp(u32(algo) + lp(digest))) + lp(lp(cert_der)) + lp(b'')
    signer = lp(signed_data) + lp(lp(u32(algo) + lp(sign(signed_data)))) + lp(pub)
    v2_value = lp(lp(signer))

    pairs = struct.pack('<Q', 4 + len(v2_value)) + u32(V2_ID) + v2_value
    # pad the block to a multiple of 4096, as apksigner does
    block_len = 8 + len(pairs) + 8 + 16
    pad = (-block_len) % 4096
    if pad:
        if pad < 12:
            pad += 4096
        pairs += struct.pack('<Q', pad - 8) + u32(PAD_ID) + b'\0' * (pad - 12)
    size = len(pairs) + 8 + 16
    block = struct.pack('<Q', size) + pairs + struct.pack('<Q', size) + b'APK Sig Block 42'

    new_eocd = eocd[:16] + struct.pack('<I', len(body) + len(block)) + eocd[20:]
    with open(dst, 'wb') as f:
        f.write(body + block + cd + new_eocd)
    print('signed', dst, 'with', cert.subject.rfc4514_string())


if __name__ == '__main__':
    main()
