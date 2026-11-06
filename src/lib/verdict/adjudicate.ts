import { relevance } from "@/lib/grade/grading";
import type {
  Claim,
  ClaimVerdict,
  Confidence,
  Evidence,
  OverallRisk,
  Verdict,
} from "@/lib/types";

const CONFLICT_CUES = ["系谣言", "为谣言", "纯属谣言", "不实信息", "虚假信息", "经核实", "并非官方"];
const OFFICIAL_CONFIRM_CUES = ["诈骗", "骗局", "套路", "警惕", "预警", "通报", "案件", "抓获", "刑拘"];

function hasCue(text: string, cues: string[]): boolean {
  return cues.some((cue) => text.includes(cue));
}

function claimFeaturesMatched(claim: Claim, evidence: Evidence[]): number {
  const corpus = evidence.map((e) => `${e.title} ${e.passage}`).join(" ");
  let matched = 0;
  if (claim.features.includes("demand") && hasCue(corpus, ["索要", "验证码", "转账", "共享", "下载"]))
    matched += 1;
  if (claim.features.includes("isolation") && hasCue(corpus, ["保密", "不要告诉", "不要挂断"]))
    matched += 1;
  if (claim.features.includes("threat") && hasCue(corpus, ["冻结", "扣费", "征信", "逮捕"]))
    matched += 1;
  if (claim.features.includes("hook") && hasCue(corpus, ["理赔", "退款", "返利", "中奖", "客服"]))
    matched += 1;
  return matched;
}

/**
 * 四态裁决：确定性规则短路，不交由大模型判断。
 * ① 一级官方证据 + 套路一致 → 官方确证
 * ② ≥2 条二级以上证据 + 特征吻合 ≥2 → 高度可疑
 * ③ 同等权威证据互相矛盾 → 存疑并列
 * ④ 其余（含零证据） → 无法判断
 */
function judgeClaim(claim: Claim, evidence: Evidence[]): ClaimVerdict {
  if (claim.verifiability === "unverifiable") {
    return {
      claimId: claim.id,
      state: "undetermined",
      reason: "该表述属于主观描述，无法通过公开信息核验",
      evidenceIds: [],
    };
  }

  const official = evidence.filter((e) => e.level === 1);
  const strong = evidence.filter((e) => e.level <= 2);
  const ids = evidence.map((e) => e.id);

  // 官方确证要求"通报与这条断言本身相关"，且断言要有实质可疑行为（恐吓/孤立/索要）
  // 只有"钩子"特征的消息（例如正常的快递柜取件通知）永远不判官方确证
  const substantiveCount = claim.features.filter((f) => f !== "hook").length;
  const relevanceGate = substantiveCount >= 2 ? 0.2 : 0.25;
  const matchedOfficial =
    substantiveCount === 0
      ? []
      : official.filter((e) => {
          const text = `${e.title} ${e.passage}`;
          if (!hasCue(text, OFFICIAL_CONFIRM_CUES)) return false;
          return relevance(claim.excerpt, text) >= relevanceGate;
        });

  const officialConfirms = matchedOfficial.length > 0;

  if (officialConfirms) {
    return {
      claimId: claim.id,
      state: "official_confirmed",
      reason: `命中 ${matchedOfficial.length} 条与该断言相关的官方来源`,
      evidenceIds: matchedOfficial.map((e) => e.id),
    };
  }

  // 冲突判定必须同时满足"有明确辟谣措辞"和"这条证据与本断言相关"
  const conflictInOfficial = official.some((e) => {
    const text = `${e.title} ${e.passage}`;
    return hasCue(text, CONFLICT_CUES) && relevance(claim.excerpt, text) >= 0.5;
  });
  const corroborates = official.some((e) => hasCue(`${e.title} ${e.passage}`, OFFICIAL_CONFIRM_CUES));
  if (substantiveCount > 0 && conflictInOfficial && corroborates) {
    return {
      claimId: claim.id,
      state: "conflicting",
      reason: "同等权威来源给出相反说法，两侧证据均已保留",
      evidenceIds: ids,
    };
  }

  if (strong.length >= 2 && claimFeaturesMatched(claim, strong) >= 2) {
    return {
      claimId: claim.id,
      state: "highly_suspicious",
      reason: `无官方直接点名，但 ${strong.length} 条二级以上来源的特征与该断言吻合`,
      evidenceIds: strong.map((e) => e.id),
    };
  }

  return {
    claimId: claim.id,
    state: "undetermined",
    reason:
      evidence.length === 0
        ? "未检索到可支撑或可反驳的证据"
        : `仅有 ${evidence.length} 条弱相关证据，不足以判断`,
    evidenceIds: ids,
  };
}

function overallOf(claims: ClaimVerdict[], all: Claim[], evidence: Evidence[]): OverallRisk {
  const stateById = new Map(claims.map((c) => [c.claimId, c.state]));
  const confirmedWithDemand = all.some(
    (c) => c.demands.length > 0 && stateById.get(c.id) === "official_confirmed",
  );
  if (confirmedWithDemand) return "high";
  if (claims.some((c) => c.state === "official_confirmed")) return "high";
  if (claims.some((c) => c.state === "highly_suspicious")) return "suspicious";
  if (claims.some((c) => c.state === "conflicting")) return "undetermined";
  // 一条断言都无法判断，且没有任何相关证据：结论是"无法判断"，不是"未见异常"
  if (claims.every((c) => c.state === "undetermined") && evidence.length === 0) {
    return "undetermined";
  }
  return "no_anomaly";
}

function confidenceOf(evidence: Evidence[]): { level: Confidence; basis: string } {
  const official = evidence.filter((e) => e.level === 1).length;
  const strong = evidence.filter((e) => e.level <= 2).length;
  if (official >= 3) {
    return { level: "high", basis: `命中 ${official} 条官方来源，结论一致性较高` };
  }
  if (official >= 1 || strong >= 2) {
    return {
      level: "medium",
      basis: `官方来源 ${official} 条、二级以上来源 ${strong} 条，仍需自行核对原文`,
    };
  }
  return { level: "low", basis: "缺乏权威来源支撑，结论仅供参考" };
}

export function adjudicate(claims: Claim[], evidence: Evidence[]): Verdict {
  const byClaim = new Map<string, Evidence[]>();
  for (const item of evidence) {
    const list = byClaim.get(item.claimId) ?? [];
    list.push(item);
    byClaim.set(item.claimId, list);
  }

  const claimVerdicts = claims.map((claim) => judgeClaim(claim, byClaim.get(claim.id) ?? []));
  const overall = overallOf(claimVerdicts, claims, evidence);
  const { level, basis } = confidenceOf(evidence);

  return { claims: claimVerdicts, overall, confidence: level, confidenceBasis: basis };
}

/** 界面文案：禁止"安全""无风险"，未命中也要保留不确定性提示 */
export const OVERALL_LABEL: Record<OverallRisk, string> = {
  high: "高危",
  suspicious: "可疑",
  undetermined: "存疑，需人工核实",
  no_anomaly: "未见异常（信息不足，请通过官方渠道再次核实）",
};
