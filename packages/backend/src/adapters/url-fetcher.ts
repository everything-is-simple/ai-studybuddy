// ============================================================
// UrlFetcher — Phase 0.8 T04B
// 安全抓取网页 URL，使用 undici + 自定义 lookup 做 SSRF 防护。
// ============================================================

import type { ConverterResult, UrlMetadata } from "@ai-studybuddy/shared";
import dns from "dns";
import net from "net";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import {
  fetch as undiciFetch,
  Agent,
  RequestInit as UndiciRequestInit,
  Response as UndiciResponse,
} from "undici";

// ── 默认限制 ────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_MAX_SIZE_BYTES = 5 * 1024 * 1024;

const ALLOWED_SCHEMES = new Set(["http:", "https:"]);
const ALLOWED_CONTENT_TYPES = new Set([
  "text/html",
  "application/xhtml+xml",
  "text/plain",
]);

// ── 类型 ────────────────────────────────────────────────────

export type LookupResolver = (
  hostname: string,
  options: dns.LookupOptions,
  callback: (
    err: NodeJS.ErrnoException | null,
    addresses: dns.LookupAddress | dns.LookupAddress[] | string,
    family?: number
  ) => void
) => void;

export type FetchImpl = (input: string, init?: UndiciRequestInit) => Promise<UndiciResponse>;

export interface UrlFetcherOptions {
  timeoutMs?: number;
  maxRedirects?: number;
  maxSizeBytes?: number;
  resolver?: LookupResolver;
  fetchImpl?: FetchImpl;
}

// ── IP 地址校验 ─────────────────────────────────────────────

function isLoopbackIp(ip: string): boolean {
  return (
    ip === "127.0.0.1" ||
    ip.startsWith("127.") ||
    ip === "::1" ||
    ip === "0:0:0:0:0:0:0:1"
  );
}

function isPrivateIp(ip: string): boolean {
  if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  if (ip.startsWith("172.")) {
    const second = Number(ip.split(".")[1]);
    if (second >= 16 && second <= 31) return true;
  }
  // IPv6 unique local (fc00::/7)
  if (ip.toLowerCase().startsWith("fc") || ip.toLowerCase().startsWith("fd")) {
    return true;
  }
  return false;
}

function isLinkLocalIp(ip: string): boolean {
  if (ip.startsWith("169.254.")) return true;
  if (ip.toLowerCase().startsWith("fe80:")) return true;
  return false;
}

function isUnspecifiedIp(ip: string): boolean {
  return ip === "0.0.0.0" || ip === "::" || ip === "0:0:0:0:0:0:0:0";
}

function isIPv4MappedIPv6(ip: string): boolean {
  return ip.toLowerCase().startsWith("::ffff:");
}

function isBlockedIp(ip: string): boolean {
  return (
    isLoopbackIp(ip) ||
    isPrivateIp(ip) ||
    isLinkLocalIp(ip) ||
    isUnspecifiedIp(ip) ||
    isIPv4MappedIPv6(ip)
  );
}

// 校验 URL 中的 IP 字面量（应用层第一道防线）
function validateUrlIpLiteral(host: string): void {
  const normalizedHost = host.replace(/^\[|\]$/g, "");
  const family = net.isIP(normalizedHost);
  if (family === 0) return; // 不是 IP 字面量，交给 DNS lookup 校验
  if (isBlockedIp(normalizedHost)) {
    throw new Error(`SSRF blocked: 地址 ${normalizedHost} 不在允许范围内`);
  }
}

// ── 安全 DNS lookup ─────────────────────────────────────────

function createSecureLookup(resolver: LookupResolver): LookupResolver {
  return (hostname, options, callback) => {
    resolver(hostname, options, (err, addresses, family) => {
      if (err) {
        callback(err, addresses, family);
        return;
      }

      const list: Array<{ address: string; family: number }> = [];
      if (Array.isArray(addresses)) {
        for (const addr of addresses) {
          list.push({ address: addr.address, family: addr.family });
        }
      } else if (typeof addresses === "string") {
        list.push({ address: addresses, family: family ?? 4 });
      } else if (addresses && typeof addresses === "object") {
        list.push({ address: addresses.address, family: addresses.family });
      }

      for (const item of list) {
        if (isBlockedIp(item.address)) {
          callback(
            new Error(`SSRF blocked: 域名解析到不允许的地址 ${item.address}`) as NodeJS.ErrnoException,
            "",
            item.family
          );
          return;
        }
      }

      callback(null, addresses, family);
    });
  };
}

// ── URL 校验 ────────────────────────────────────────────────

function validateUrl(url: URL): void {
  if (!ALLOWED_SCHEMES.has(url.protocol)) {
    throw new Error(`SSRF blocked: 不支持的协议 ${url.protocol}`);
  }

  if (url.username || url.password) {
    throw new Error("SSRF blocked: URL 中不允许包含用户信息");
  }

  const allowedPort = url.protocol === "http:" ? "80" : "443";
  if (url.port && url.port !== allowedPort) {
    throw new Error(`SSRF blocked: 不允许的端口 ${url.port}，${url.protocol} 仅支持 ${allowedPort}`);
  }

  validateUrlIpLiteral(url.hostname);
}

// ── 响应读取与大小限制 ─────────────────────────────────────

async function readBodyWithSizeLimit(
  response: UndiciResponse,
  maxBytes: number
): Promise<Buffer> {
  if (!response.body) {
    return Buffer.alloc(0);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    total += value.length;
    if (total > maxBytes) {
      await reader.cancel("response too large");
      throw new Error(`响应体积超过 ${maxBytes} 字节上限`);
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

// ── Content-Type 校验 ───────────────────────────────────────

function isAllowedContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const parsed = contentType.split(";")[0].trim().toLowerCase();
  return ALLOWED_CONTENT_TYPES.has(parsed);
}

// ── HTML 正文提取 ───────────────────────────────────────────

function extractArticleFromHtml(html: string, finalUrl: string): {
  text: string;
  title?: string;
  byline?: string;
  warnings: string[];
} {
  const dom = new JSDOM(html, { url: finalUrl });
  const document = dom.window.document;

  // 剥离 script/style/noscript/iframe
  for (const selector of ["script", "style", "noscript", "iframe"]) {
    for (const el of Array.from(document.querySelectorAll(selector))) {
      el.remove();
    }
  }

  const reader = new Readability(document);
  const article = reader.parse();

  const warnings: string[] = [];
  if (article && article.textContent && article.textContent.trim().length > 0) {
    return {
      text: article.textContent.trim(),
      title: article.title || undefined,
      byline: article.byline || undefined,
      warnings,
    };
  }

  // fallback: body textContent
  const bodyText = document.body ? document.body.textContent || "" : "";
  if (bodyText.trim().length > 0) {
    warnings.push("Readability 提取正文失败，已 fallback 到 body 文本");
    return {
      text: bodyText.trim(),
      title: document.title || undefined,
      warnings,
    };
  }

  return { text: "", warnings: ["未能从 HTML 中提取到正文"] };
}

// ── UrlFetcher ──────────────────────────────────────────────

export class UrlFetcher {
  private timeoutMs: number;
  private maxRedirects: number;
  private maxSizeBytes: number;
  private resolver: LookupResolver;
  private fetchImpl: FetchImpl;

  constructor(options: UrlFetcherOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    this.maxSizeBytes = options.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
    this.resolver = options.resolver ?? (dns.lookup as unknown as LookupResolver);
    this.fetchImpl = options.fetchImpl ?? (undiciFetch as unknown as FetchImpl);
  }

  async fetch(url: string): Promise<ConverterResult> {
    if (typeof url !== "string" || url.trim().length === 0) {
      return {
        ok: false,
        sourceType: "url",
        error: "URL 不能为空",
      };
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return {
        ok: false,
        sourceType: "url",
        error: `URL 解析失败: ${url}`,
      };
    }

    try {
      validateUrl(parsedUrl);
    } catch (error) {
      return {
        ok: false,
        sourceType: "url",
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const agent = new Agent({
      connect: {
        lookup: createSecureLookup(this.resolver) as unknown as net.LookupFunction,
      },
    });

    try {
      const controller = new AbortController();
      const deadline = Date.now() + this.timeoutMs;
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        return await this.fetchWithRedirects(parsedUrl, agent, 0, controller, deadline);
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      const errWithCause = error instanceof Error ? (error as Error & { cause?: unknown }) : undefined;
      const rootError =
        errWithCause && errWithCause.cause instanceof Error
          ? errWithCause.cause
          : error;
      return {
        ok: false,
        sourceType: "url",
        error: rootError instanceof Error ? rootError.message : String(rootError),
      };
    } finally {
      await agent.close();
    }
  }

  private async fetchWithRedirects(
    url: URL,
    agent: Agent,
    redirectCount: number,
    controller: AbortController,
    deadline: number
  ): Promise<ConverterResult> {
    if (redirectCount > this.maxRedirects) {
      throw new Error(`重定向次数超过上限 ${this.maxRedirects}`);
    }

    if (controller.signal.aborted || Date.now() >= deadline) {
      throw new Error("URL 抓取超时");
    }

    const response = await this.fetchImpl(url.toString(), {
      dispatcher: agent,
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "User-Agent": "AIStudyBuddyBot/0.8 (+https://ai-studybuddy.local/bot)",
      },
    });

    // 处理重定向
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await this.consumeBody(response);
      if (!location) {
        throw new Error(`收到 ${response.status} 重定向响应但缺少 Location 头`);
      }
      const nextUrl = new URL(location, url.toString());
      validateUrl(nextUrl);
      return this.fetchWithRedirects(nextUrl, agent, redirectCount + 1, controller, deadline);
    }

    if (!response.ok) {
      await this.consumeBody(response);
      throw new Error(`上游响应 ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type");
    if (!isAllowedContentType(contentType)) {
      await this.consumeBody(response);
      throw new Error(`不支持的 Content-Type: ${contentType || "空"}`);
    }

    const body = await readBodyWithSizeLimit(response, this.maxSizeBytes);
    const byteCount = body.length;
    const html = body.toString("utf-8");

    const { text, title, byline, warnings } = extractArticleFromHtml(
      html,
      url.toString()
    );

    const metadata: UrlMetadata = {
      finalUrl: url.toString(),
      redirectCount,
      byteCount,
    };
    if (title) metadata.title = title;
    if (byline) metadata.byline = byline;

    if (!text || text.length === 0) {
      return {
        ok: false,
        sourceType: "url",
        metadata,
        warnings: warnings.length > 0 ? warnings : undefined,
        error: "未能从网页中提取到正文",
      };
    }

    return {
      ok: true,
      sourceType: "url",
      text,
      metadata: { ...metadata, charCount: text.length },
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  private async consumeBody(response: UndiciResponse): Promise<void> {
    if (!response.body) return;
    try {
      await response.arrayBuffer();
    } catch {
      // 忽略消费失败
    }
  }
}
