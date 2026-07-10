import json
import os
import sys

if len(sys.argv) != 2:
    print('expected image path', file=sys.stderr)
    sys.exit(2)
path = sys.argv[1]
if not os.path.isfile(path):
    print('input file does not exist', file=sys.stderr)
    sys.exit(3)
try:
    from rapidocr_onnxruntime import RapidOCR
except Exception as error:
    print(f'RapidOCR unavailable: {error}', file=sys.stderr)
    sys.exit(4)
engine = RapidOCR()
result, elapsed = engine(path)
texts = [line[1] for line in (result or [])]
print(json.dumps({'ok': True, 'text': '\n'.join(texts), 'lineCount': len(texts), 'elapsedSeconds': elapsed}, ensure_ascii=False))
