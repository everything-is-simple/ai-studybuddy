import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

const runtimeRoot = path.resolve('test-runtime', 'semester-ocr-config');
process.env.APP_DATA_ROOT = runtimeRoot;
process.env.PYTHON_PATH = path.join(runtimeRoot, 'venv', 'Scripts', 'python.exe');
process.env.OCR_TIMEOUT_MS = '12345';
process.env.OCR_TEMP_ROOT = path.join(runtimeRoot, 'tmp', 'ocr');
process.env.OCR_CACHE_ROOT = path.join(runtimeRoot, 'models', 'rapidocr');

const { OcrConverter } = await import('../dist/adapters/converter.js');
const { OcrTimetableRecognizer, getTimetableOcrConverterOptions } =
  await import('../dist/services/semester-selector-service.js');

test('semester timetable OCR uses the configured production runtime paths', async () => {
  const expected = {
    pythonPath: process.env.PYTHON_PATH,
    timeoutMs: 12345,
    tempRoot: path.resolve(process.env.OCR_TEMP_ROOT),
    cacheRoot: path.resolve(process.env.OCR_CACHE_ROOT),
  };
  assert.deepEqual(getTimetableOcrConverterOptions(), expected);

  const originalConvert = OcrConverter.prototype.convert;
  let captured;
  OcrConverter.prototype.convert = async function captureRuntimeOptions() {
    captured = {
      pythonPath: this.pythonPath,
      timeoutMs: this.timeoutMs,
      tempRoot: this.tempRoot,
      cacheRoot: this.cacheRoot,
    };
    return { ok: true, sourceType: 'image', text: '周一 08:00-08:45 数学 101' };
  };

  try {
    const result = await new OcrTimetableRecognizer().recognize('synthetic.png');
    assert.equal(result.text, '周一 08:00-08:45 数学 101');
    assert.deepEqual(captured, expected);
  } finally {
    OcrConverter.prototype.convert = originalConvert;
  }
});
