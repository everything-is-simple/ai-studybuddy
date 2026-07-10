const { spawn } = require("node:child_process");
const path = require("node:path");
function runOcr(filePath, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, '..', '04-rapidocr-child', 'smoke-test', 'rapidocr-child.py');
    const python = process.env.PHASE07_PYTHON || 'python';
    const child = spawn(python, [script, filePath], { windowsHide: true });
    let stdout = '', stderr = '', settled = false;
    const finish = (fn, value) => { if (!settled) { settled = true; clearTimeout(timer); fn(value); } };
    const timer = setTimeout(() => { child.kill(); finish(reject, new Error('OCR timed out')); }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => finish(reject, error));
    child.on('close', (code) => {
      if (code !== 0) return finish(reject, new Error(stderr.trim() || `OCR exited ${code}`));
      try { finish(resolve, JSON.parse(stdout)); } catch { finish(reject, new Error('OCR stdout was not JSON')); }
    });
  });
}
module.exports = { runOcr };
