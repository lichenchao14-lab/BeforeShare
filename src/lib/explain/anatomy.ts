import type { AnatomyRow, AnatomySegment, Claim, DemandAction, Evidence, Foresight } from "@/lib/types";

const SEGMENT_ORDER: AnatomySegment[] = ["hook", "threat", "isolation", "demand"];

const SEGMENT_LABEL: Record<AnatomySegment, string> = {
  hook: "钩子：给一个必须回应的理由",
  threat: "施压：制造恐惧或利益诱惑",
  isolation: "孤立：阻断求助与核实",
  demand: "索要：让你交出钱、码或权限",
};

export const SEGMENT_TITLE = SEGMENT_LABEL;

/** 套路解剖：四段映射，缺失段落标"未见"，不虚构原文 */
export function buildAnatomy(claims: Claim[]): AnatomyRow[] {
  return SEGMENT_ORDER.map((segment) => {
    const hit = claims.find((c) => c.features.includes(segment as never));
    return {
      segment,
      hit: Boolean(hit),
      excerpt: hit ? hit.excerpt : null,
    };
  });
}

const ACTION_WORDS: Record<DemandAction, string[]> = {
  verification_code: ["验证码", "校验码", "动态码", "短信码"],
  screen_share: ["屏幕共享", "共享屏幕", "远程控制", "远程协助", "会议软件"],
  transfer: ["转账", "汇款", "安全账户", "保证金", "解冻费", "刷流水"],
  install_app: ["下载", "安装", "App", "APK", "小程序"],
  secrecy: ["保密", "不要告诉", "别告诉", "不能告诉"],
};

const MIN_CASES = 3;

/**
 * 话术剧透：只做标签频次统计，不做文本预测。
 * 同类案例少于 3 条时返回 null，由界面改为展示官方通报摘录。
 */
export function buildForesight(evidence: Evidence[]): Foresight | null {
  const cases = evidence.filter((e) => e.level <= 3);
  if (cases.length < MIN_CASES) return null;

  const corpus = cases.map((e) => `${e.title} ${e.passage}`).join(" ");
  const items = (Object.keys(ACTION_WORDS) as DemandAction[])
    .map((action) => ({
      action,
      count: cases.filter((e) =>
        ACTION_WORDS[action].some((w) => `${e.title} ${e.passage}`.includes(w)),
      ).length,
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);

  if (items.length === 0 || !corpus) return null;
  return { totalCases: cases.length, items };
}

export const ACTION_LABEL: Record<DemandAction, string> = {
  verification_code: "索要验证码",
  screen_share: "要求屏幕共享或远程控制",
  transfer: "引导转账至所谓安全账户",
  install_app: "要求下载安装应用",
  secrecy: "要求对家人保密",
};
