import type { Claim, Evidence, SourceLevel } from "@/lib/types";
import type { RetrievedItem } from "@/lib/retrieve/orchestrator";
import { safeHost } from "@/lib/retrieve/wsa";

const OFFICIAL_SUFFIX = [".gov.cn", ".gov", ".court.gov.cn"];
const OFFICIAL_HOSTS = ["mps.gov.cn", "spp.gov.cn", "12377.cn", "12315.cn"];
const MEDIA_HOSTS = [
  "cctv.com",
  "news.cn",
  "xinhuanet.com",
  "people.com.cn",
  "gmw.cn",
  "cnr.cn",
  "chinadaily.com.cn",
  "thepaper.cn",
  "yicai.com",
  "caixin.com",
  "21jingji.com",
  "stcn.com",
];
const INSTITUTION_HOSTS = [
  "tencent.com",
  "qq.com",
  "alipay.com",
  "taobao.com",
  "tmall.com",
  "jd.com",
  "pinduoduo.com",
  "meituan.com",
  "12306.cn",
  "ctrip.com",
];

export function levelByHost(url: string, site: string): SourceLevel {
  const host = safeHost(url).toLowerCase();
  if (!host) return 4;
  if (OFFICIAL_SUFFIX.some((suffix) => host.endsWith(suffix))) return 1;
  if (OFFICIAL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return 1;
  if (MEDIA_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return 2;
  if (INSTITUTION_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return 3;
  if (site.includes("官方") || site.includes("公告")) return 3;
  return 4;
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/$/, "")}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

function shingles(text: string): Set<string> {
  const clean = text.replace(/<[A-Z]+_\d+>/g, "").replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, "");
  const set = new Set<string>();
  for (let i = 0; i < clean.length - 1; i += 1) {
    set.add(clean.slice(i, i + 2));
  }
  return set;
}

/** 证据与断言的相关度：2-gram 覆盖率 */
export function relevance(claimText: string, resultText: string): number {
  const claimSet = shingles(claimText);
  if (claimSet.size === 0) return 0;
  const resultSet = shingles(resultText);
  let hit = 0;
  for (const token of claimSet) {
    if (resultSet.has(token)) hit += 1;
  }
  return hit / claimSet.size;
}

const FRAUD_SIGNALS = [
  "诈骗",
  "骗局",
  "反诈",
  "被骗",
  "止损",
  "陷阱",
  "套路",
  "骗术",
  "虚假",
  "假冒",
  "警惕",
  "防范",
  "刑拘",
  "抓获",
  "报案",
  "报警",
  "劝阻",
];

export function hasFraudSignal(text: string): boolean {
  return FRAUD_SIGNALS.some((cue) => text.includes(cue));
}

function normalizeTitle(title: string): string {
  return title
    .replace(/[【】\[\]（）()「」《》\s·\-—_，。！？、：:,.;!?"'“”‘’]/g, "")
    .trim();
}

function isOldCase(publishedAt: string | null): boolean {
  if (!publishedAt) return false;
  const time = Date.parse(publishedAt);
  if (Number.isNaN(time)) return false;
  const twoYears = 24 * 30 * 24 * 60 * 60 * 1000;
  return Date.now() - time > twoYears;
}

export interface GradeOutcome {
  evidence: Evidence[];
  peripheral: Evidence[];
}

/**
 * 证据池构建：按 URL 去重、相似正文合并、按信源分级、标注时效并归属断言。
 * 冲突证据一律保留，交由裁决环节处理。
 */
export function grade(items: RetrievedItem[], claims: Claim[]): GradeOutcome {
  const claimById = new Map(claims.map((c) => [c.id, c]));
  const byUrl = new Map<string, Evidence>();
  const byTitle = new Map<string, string>();
  let counter = 0;

  for (const item of items) {
    const { result, claimId } = item;
    const claim = claimById.get(claimId);
    if (!claim) continue;

    const text = `${result.title} ${result.passage}`;
    const rel = relevance(claim.excerpt, text);
    // 质量门槛：既无诈骗语境、又与断言弱相关的结果直接丢弃
    if (!hasFraudSignal(text) && rel < 0.35) continue;

    const key = normalizeUrl(result.url);
    const titleKey = normalizeTitle(result.title);
    const level = levelByHost(result.url, result.site);
    const targetClaimId = rel >= 0.15 ? claimId : "peripheral";

    const duplicateKey = byUrl.has(key) ? byUrl.get(key)!.id : undefined;
    const titleOwner = titleKey.length >= 8 ? byTitle.get(titleKey) : undefined;

    if (duplicateKey || titleOwner) {
      // 去重：同一文章的多方转载只保留权威度最高的一份
      const ownerId = duplicateKey ?? titleOwner!;
      const owner = [...byUrl.values()].find((e) => e.id === ownerId);
      if (owner) {
        const currentBetter =
          level < owner.level ||
          (level === owner.level && (result.date ?? "9999") < (owner.publishedAt ?? "9999"));
        owner.mergedFrom += 1;
        if (currentBetter) {
          // 先记住旧 key 再覆盖 url，否则旧条目会残留在 byUrl 里导致同一证据出现两次
          const previousKey = normalizeUrl(owner.url);
          owner.title = result.title;
          owner.url = result.url;
          owner.site = result.site;
          owner.publishedAt = result.date;
          owner.passage = result.passage;
          owner.level = level;
          owner.score = result.score;
          owner.isOldCase = isOldCase(result.date);
          if (previousKey !== key) byUrl.delete(previousKey);
          byUrl.set(key, owner);
          byTitle.set(titleKey, owner.id);
        }
      }
      continue;
    }

    counter += 1;
    const evidence: Evidence = {
      id: `e${counter}`,
      claimId: targetClaimId,
      title: result.title,
      url: result.url,
      site: result.site,
      publishedAt: result.date,
      passage: result.passage,
      level,
      score: result.score,
      mergedFrom: 0,
      isOldCase: isOldCase(result.date),
    };
    byUrl.set(key, evidence);
    if (titleKey.length >= 8) byTitle.set(titleKey, evidence.id);
  }

  // 兜底：按 id 去重，确保同一证据不会因为多个 URL 键重复出现
  const uniqueAll = [...new Map([...byUrl.values()].map((e) => [e.id, e])).values()];
  const all = uniqueAll.sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    return (b.publishedAt ?? "").localeCompare(a.publishedAt ?? "");
  });

  return {
    evidence: all.filter((e) => e.claimId !== "peripheral"),
    peripheral: all.filter((e) => e.claimId === "peripheral"),
  };
}
