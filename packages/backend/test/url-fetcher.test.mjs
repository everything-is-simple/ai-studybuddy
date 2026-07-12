import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import test from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { UrlFetcher } = await import(
  pathToFileURL(path.join(__dirname, "../dist/adapters/url-fetcher.js")).href
);

// ── 测试辅助 ─────────────────────────────────────────────────

function createReadableStream(chunks) {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(typeof chunks[index] === "string" ? Buffer.from(chunks[index], "utf-8") : chunks[index]);
      index += 1;
    },
  });
}

function mockResponse({ status = 200, headers = {}, body = "", url = "http://example.com/" }) {
  const bodyInit = typeof body === "string" ? Buffer.from(body, "utf-8") : body;
  return new Response(bodyInit, { status, headers, url });
}

function createRecordingResolver(records, address, family = 4) {
  return (hostname, options, callback) => {
    records.push({ hostname, options });
    // 模拟 dns.lookup 行为：options.all 为 true 时返回数组
    if (options?.all) {
      callback(null, [{ address, family }]);
    } else {
      callback(null, address, family);
    }
  };
}

// ── 测试 ─────────────────────────────────────────────────────

test("UrlFetcher rejects unsupported protocol", async () => {
  const fetcher = new UrlFetcher();
  const result = await fetcher.fetch("ftp://example.com/file.txt");

  assert.equal(result.ok, false);
  assert.equal(result.sourceType, "url");
  assert.ok(result.error.includes("协议"));
});

test("UrlFetcher rejects URL with user-info", async () => {
  const fetcher = new UrlFetcher();
  const result = await fetcher.fetch("http://user:pass@example.com/");

  assert.equal(result.ok, false);
  assert.equal(result.sourceType, "url");
  assert.ok(result.error.includes("用户"));
});

test("UrlFetcher rejects non-standard port", async () => {
  const fetcher = new UrlFetcher();
  const result = await fetcher.fetch("http://example.com:8080/");

  assert.equal(result.ok, false);
  assert.equal(result.sourceType, "url");
  assert.ok(result.error.includes("端口"));
});

test("UrlFetcher rejects loopback IP literal at URL validation", async () => {
  const fetcher = new UrlFetcher();
  const result = await fetcher.fetch("http://127.0.0.1/secret");

  assert.equal(result.ok, false);
  assert.equal(result.sourceType, "url");
  assert.ok(result.error.includes("SSRF"));
});

test("UrlFetcher uses secure lookup and rejects resolved private IP", async () => {
  const records = [];
  const resolver = createRecordingResolver(records, "127.0.0.1");
  const fetcher = new UrlFetcher({ resolver, timeoutMs: 2000 });

  const result = await fetcher.fetch("http://internal.example.com/");

  assert.equal(result.ok, false);
  assert.equal(result.sourceType, "url");
  assert.ok(result.error.includes("SSRF"));
  assert.ok(records.length > 0, "自定义 lookup 应被调用");
  assert.equal(records[0].hostname, "internal.example.com");
});

test("UrlFetcher rejects redirect to loopback IP", async () => {
  const fetcher = new UrlFetcher({
    fetchImpl: async () =>
      mockResponse({
        status: 302,
        headers: { location: "http://127.0.0.1/secret" },
        body: "",
      }),
  });

  const result = await fetcher.fetch("http://example.com/");

  assert.equal(result.ok, false);
  assert.ok(result.error.includes("SSRF"));
});

test("UrlFetcher rejects redirect chain exceeding limit", async () => {
  let callCount = 0;
  const fetcher = new UrlFetcher({
    maxRedirects: 1,
    fetchImpl: async (input) => {
      callCount += 1;
      return mockResponse({
        status: 302,
        headers: { location: `${input}/next` },
        body: "",
      });
    },
  });

  const result = await fetcher.fetch("http://public.example.com/");

  assert.equal(result.ok, false);
  assert.ok(result.error.includes("重定向"));
});

test("UrlFetcher rejects response exceeding size limit", async () => {
  const bigBody = createReadableStream([
    Buffer.alloc(2 * 1024 * 1024),
    Buffer.alloc(2 * 1024 * 1024),
    Buffer.alloc(2 * 1024 * 1024),
  ]);

  const fetcher = new UrlFetcher({
    maxSizeBytes: 5 * 1024 * 1024,
    fetchImpl: async () =>
      mockResponse({
        headers: { "content-type": "text/html" },
        body: bigBody,
      }),
  });

  const result = await fetcher.fetch("http://example.com/big");

  assert.equal(result.ok, false);
  assert.ok(result.error.includes("体积") || result.error.includes("大小"));
});

test("UrlFetcher rejects disallowed Content-Type", async () => {
  const fetcher = new UrlFetcher({
    fetchImpl: async () =>
      mockResponse({
        headers: { "content-type": "application/json" },
        body: '{"x":1}',
      }),
  });

  const result = await fetcher.fetch("http://example.com/api");

  assert.equal(result.ok, false);
  assert.ok(result.error.includes("Content-Type"));
});

test("UrlFetcher accepts text/plain Content-Type", async () => {
  const fetcher = new UrlFetcher({
    fetchImpl: async () =>
      mockResponse({
        headers: { "content-type": "text/plain; charset=utf-8" },
        body: "这是纯文本内容。",
      }),
  });

  const result = await fetcher.fetch("http://example.com/plain.txt");

  assert.equal(result.ok, true);
  assert.equal(result.sourceType, "url");
  assert.ok(result.text.includes("这是纯文本内容"));
  assert.equal(result.metadata.byteCount, Buffer.byteLength("这是纯文本内容。", "utf-8"));
});

test("UrlFetcher extracts article with Readability", async () => {
  const html = `<!DOCTYPE html>
<html><head><title>示例文章</title></head>
<body>
  <nav>导航</nav>
  <article><p>这是正文第一段。</p><p>这是正文第二段。</p></article>
  <script>alert('x')</script>
  <footer>页脚</footer>
</body></html>`;

  const fetcher = new UrlFetcher({
    fetchImpl: async () =>
      mockResponse({
        headers: { "content-type": "text/html" },
        body: html,
      }),
  });

  const result = await fetcher.fetch("http://example.com/article");

  assert.equal(result.ok, true);
  assert.equal(result.sourceType, "url");
  assert.ok(result.text.includes("这是正文第一段"));
  assert.ok(!result.text.includes("alert"), "script 内容应被剥离");
  assert.equal(result.metadata.title, "示例文章");
});

test("UrlFetcher falls back to body text when Readability fails", async () => {
  const html = `<!DOCTYPE html>
<html><head><title>无结构页</title></head>
<body>
  <footer>body 中的文字内容。</footer>
</body></html>`;

  const fetcher = new UrlFetcher({
    fetchImpl: async () =>
      mockResponse({
        headers: { "content-type": "text/html" },
        body: html,
      }),
  });

  const result = await fetcher.fetch("http://example.com/bare");

  assert.equal(result.ok, true);
  assert.equal(result.sourceType, "url");
  assert.ok(result.text.includes("body 中的文字内容"));
  assert.ok(result.warnings && result.warnings.some((w) => w.includes("fallback") || w.includes("body")));
});

test("UrlFetcher enforces redirect limit", async () => {
  let callCount = 0;
  const fetcher = new UrlFetcher({
    maxRedirects: 2,
    fetchImpl: async () => {
      callCount += 1;
      return mockResponse({
        status: 302,
        headers: { location: "http://example.com/redirect" },
        body: "",
      });
    },
  });

  const result = await fetcher.fetch("http://example.com/");

  assert.equal(result.ok, false);
  assert.ok(result.error.includes("重定向"));
  assert.ok(callCount <= 4, `应有限制重定向次数，实际调用 ${callCount} 次`);
});

test("UrlFetcher handles upstream error response", async () => {
  const fetcher = new UrlFetcher({
    fetchImpl: async () => mockResponse({ status: 500, body: "server error" }),
  });

  const result = await fetcher.fetch("http://example.com/");

  assert.equal(result.ok, false);
  assert.ok(result.error.includes("500"));
});
