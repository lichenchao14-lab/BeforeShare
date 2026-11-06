import type { Claim, QueryDirection } from "@/lib/types";

export interface QueryPlan {
  claimId: string;
  direction: QueryDirection;
  query: string;
  priority: number;
}

const INSTITUTIONS = [
  "淘宝",
  "天猫",
  "京东",
  "拼多多",
  "支付宝",
  "微信",
  "抖音",
  "快手",
  "美团",
  "饿了么",
  "顺丰",
  "中通",
  "圆通",
  "韵达",
  "申通",
  "邮政",
  "银行",
  "工商银行",
  "建设银行",
  "农业银行",
  "招商银行",
  "公安",
  "法院",
  "检察院",
  "社保局",
  "医保局",
  "12306",
  "携程",
  "航空公司",
];

const DIRECTION_WEIGHT: Record<QueryDirection, number> = {
  official: 3,
  pattern: 2,
  channel: 1,
  cases: 0,
};

/** 去掉占位符与标点，抽成一条短检索词 */
export function extractKeywords(excerpt: string, limit = 28): string {
  const cleaned = excerpt
    .replace(/<[A-Z]+_\d+>/g, " ")
    .replace(/[，。！？、；：“”‘’（）()【】《》\-—…·,.\s]+/g, " ")
    .trim();
  return cleaned.length > limit ? cleaned.slice(0, limit) : cleaned;
}

/** 取消息中最先出现的机构名，避免把"添加理赔专员微信"里的微信当成被冒充主体 */
export function extractInstitution(text: string): string | null {
  const hits = INSTITUTIONS.map((name) => ({ name, index: text.indexOf(name) })).filter(
    (hit) => hit.index >= 0,
  );
  if (hits.length === 0) return null;
  hits.sort((a, b) => a.index - b.index || b.name.length - a.name.length);
  return hits[0].name;
}

function detectInstitution(claim: Claim, allText: string): string | null {
  return extractInstitution(`${claim.excerpt} ${allText}`);
}

function claimPriority(claim: Claim): number {
  if (claim.demands.length > 0) return 4;
  if (claim.features.includes("isolation")) return 3;
  if (claim.features.includes("threat")) return 2;
  if (claim.features.includes("hook")) return 1;
  return 0;
}

/**
 * 按"断言 × 检索方向"生成检索式，并按优先级裁剪到上限。
 * 方向固定四类：套路命名、官方通报、机构真实渠道、同类案例。
 */
export function buildQueryPlans(
  claims: Claim[],
  sourceText: string,
  maxQueries: number,
): { plans: QueryPlan[]; trimmed: QueryPlan[] } {
  const institution = detectInstitution(claims[0] ?? { excerpt: "" } as Claim, sourceText);
  const candidates: QueryPlan[] = [];

  for (const claim of claims) {
    if (claim.verifiability !== "verifiable") continue;
    const keywords = extractKeywords(claim.excerpt);
    if (keywords.length < 2) continue;
    const base = claimPriority(claim) * 10;

    candidates.push({
      claimId: claim.id,
      direction: "official",
      query: `${keywords} 诈骗 警方通报`,
      priority: base + DIRECTION_WEIGHT.official,
    });
    candidates.push({
      claimId: claim.id,
      direction: "pattern",
      query: `${keywords} 诈骗 套路`,
      priority: base + DIRECTION_WEIGHT.pattern,
    });
    if (institution) {
      candidates.push({
        claimId: claim.id,
        direction: "channel",
        query: `${institution} 官方客服 电话 核实 渠道`,
        priority: base + DIRECTION_WEIGHT.channel,
      });
    }
    candidates.push({
      claimId: claim.id,
      direction: "cases",
      query: `${keywords} 诈骗 案例 受害者 经历`,
      priority: base + DIRECTION_WEIGHT.cases,
    });
  }

  candidates.sort((a, b) => b.priority - a.priority);
  const seen = new Set<string>();
  const unique: QueryPlan[] = [];
  for (const plan of candidates) {
    if (seen.has(plan.query)) continue;
    seen.add(plan.query);
    unique.push(plan);
  }

  return {
    plans: unique.slice(0, maxQueries),
    trimmed: unique.slice(maxQueries),
  };
}
