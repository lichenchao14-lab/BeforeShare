/**
 * 元宝搜索（WSA）客户端。
 * 接口：POST https://api.wsa.cloud.tencent.com/SearchPro
 * 鉴权：Authorization: Bearer <API KEY>
 * 返回：Response.Pages 为 JSON 字符串数组，元素含 passage/title/url/site/date/score。
 */

export interface RawSearchResult {
  title: string;
  url: string;
  site: string;
  date: string | null;
  passage: string;
  score: number;
}

const ENDPOINT = "https://api.wsa.cloud.tencent.com/SearchPro";

export class SearchUnavailableError extends Error {}

interface SearchOptions {
  timeoutMs: number;
  retries?: number;
  tuning?: SearchTuning;
}

/** SearchPro 的可选检索参数，已通过实测确认 API KEY 方式同样生效 */
export interface SearchTuning {
  /** 垂直领域：gov 政府 / news 新闻 / acad 学术 / finance 财经 */
  industry?: "gov" | "news" | "acad" | "finance";
  /** 时效范围：d7 / m3 / y2 或 yyyy-mm-dd[,yyyy-mm-dd] */
  freshness?: string;
  /** 返回条数，取值 10/20/30/40/50 */
  cnt?: number;
}

function buildBody(query: string, tuning?: SearchTuning): string {
  const payload: Record<string, unknown> = { Query: query };
  if (tuning?.industry) payload.Industry = tuning.industry;
  if (tuning?.freshness) payload.Freshness = tuning.freshness;
  if (tuning?.cnt) payload.Cnt = tuning.cnt;
  return JSON.stringify(payload);
}

function parsePage(page: string): RawSearchResult | null {
  try {
    const obj = JSON.parse(page) as Record<string, unknown>;
    const url = typeof obj.url === "string" ? obj.url : "";
    if (!url) return null;
    return {
      title: typeof obj.title === "string" ? obj.title : url,
      url,
      site: typeof obj.site === "string" && obj.site ? obj.site : safeHost(url),
      date: typeof obj.date === "string" && obj.date ? obj.date : null,
      passage: typeof obj.passage === "string" ? obj.passage : "",
      score: typeof obj.score === "number" ? obj.score : 0,
    };
  } catch {
    return null;
  }
}

export function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/** 容忍控制台复制时带上的"API KEY:"前缀 */
function normalizeKey(raw: string | undefined): string {
  if (!raw) return "";
  return raw.replace(/^\s*api\s*key\s*[:：]\s*/i, "").trim();
}

export async function searchWsa(
  query: string,
  options: SearchOptions,
): Promise<RawSearchResult[]> {
  const apiKey = normalizeKey(process.env.TENCENTCLOUD_WSA_APIKEY);
  if (!apiKey) {
    throw new SearchUnavailableError("未配置 TENCENTCLOUD_WSA_APIKEY");
  }

  const retries = options.retries ?? 0;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: buildBody(query, options.tuning),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = (await response.json()) as {
        Response?: { Pages?: unknown };
      };
      const pages = payload.Response?.Pages;
      if (!Array.isArray(pages)) return [];

      return pages
        .filter((p): p is string => typeof p === "string")
        .map(parsePage)
        .filter((r): r is RawSearchResult => r !== null);
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("检索失败");
}
