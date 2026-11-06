import type { ActionPlan, Evidence, FamilyBrief, FamilyState, OverallRisk } from "@/lib/types";

const ACCUSATORY = ["你怎么又", "早就说", "这么明显", "怎么还", "活该", "居然信", "你又不听"];

const DISCLAIMER = "信息核验参考，不构成安全承诺；紧急情况请拨打 96110 或 110。";

/** 非指责语气校验：剥离指责性措辞，保留第三人称描述 */
export function stripAccusatory(text: string): string {
  return ACCUSATORY.reduce((acc, word) => acc.split(word).join(""), text);
}

const CONCLUSION: Record<OverallRisk, string> = {
  high: "这段内容与已被官方通报的诈骗套路高度吻合，请立刻停止操作。",
  suspicious: "这段内容的特征与常见骗局接近，建议先停下来核实。",
  undetermined: "现有信息不足以判断真假，请通过官方渠道核实后再做决定。",
  no_anomaly: "暂未发现与该内容对应的诈骗通报，但这不等于安全，请仍通过官方渠道核实。",
};

export interface BriefInput {
  overall: OverallRisk;
  evidence: Evidence[];
  firstAction: string;
  institution: string | null;
}

/** 家人提醒卡：四要素（结论 / ≤3 条依据 / 一条行动 / 核实渠道）+ 免责 */
export function buildBrief(input: BriefInput): FamilyBrief {
  const top = [...input.evidence]
    .sort((a, b) => a.level - b.level)
    .slice(0, 3)
    .map((e) => ({
      title: e.title,
      site: e.site,
      publishedAt: e.publishedAt,
      url: e.url,
    }));

  return {
    conclusion: stripAccusatory(CONCLUSION[input.overall]),
    evidence: top,
    action: stripAccusatory(input.firstAction),
    channel: input.institution
      ? `请通过「${input.institution}」官方 App 或官网公布的客服电话核实，不要回拨来电号码`
      : "请通过官方 App、官网客服或 96110 核实，不要按对方要求操作",
    disclaimer: DISCLAIMER,
  };
}

export { DISCLAIMER };

interface StateActionSet {
  items: string[];
  emergency: boolean;
}

const ACTION_SETS: Record<FamilyState, StateActionSet> = {
  message_only: {
    emergency: false,
    items: [
      "让对方停止回复，不要点击消息里的任何链接",
      "不要回拨来电号码，通过官方 App 或官网找客服核实",
      "把这条消息转发给家人一起确认，避免单独判断",
      "保存消息截图，便于后续比对与举报",
    ],
  },
  joined_group: {
    emergency: false,
    items: [
      "立即退出该群聊，不要再看群内的“收益截图”",
      "修改与该群相关的账号密码，开启二次验证",
      "检查是否填写过身份证、银行卡或家庭住址",
      "若已填写，联系对应平台客服冻结相关业务",
    ],
  },
  remote_access: {
    emergency: true,
    items: [
      "立即卸载对方要求安装的应用，关闭屏幕共享",
      "断开手机网络，改用另一台设备联系家人",
      "修改支付、银行与社交账号密码",
      "查询近 24 小时账户变动，发现异常立即联系银行",
      "拨打 96110 说明情况，按指引处置",
    ],
  },
  transferred: {
    emergency: true,
    items: [
      "立即拨打 96110 与 110 报警，说明转账时间与金额",
      "联系银行申请止付或冻结，保留转账流水",
      "保存聊天记录、通话记录与对方账号信息",
      "不要相信所谓“退款需再转账”的后续说法",
      "陪同家人前往派出所做笔录，避免其被二次劝说",
    ],
  },
};

/** 行动分档：止损优先 → 证据保留 → 后续跟进 */
export function buildActionPlan(state: FamilyState, firstAction?: string): ActionPlan {
  const set = ACTION_SETS[state];
  const items = set.items.map((text, index) => ({
    order: index + 1,
    text: stripAccusatory(text),
  }));

  // 结论带来的首要动作插入到最前面，但不打乱止损优先的顺序
  if (firstAction && (state === "message_only" || state === "joined_group")) {
    items.unshift({ order: 0, text: stripAccusatory(firstAction) });
    items.forEach((item, index) => {
      item.order = index + 1;
    });
  }

  return {
    state,
    items,
    emergency: set.emergency,
    disclaimer: "以上为通用处置建议，请以警方与银行指引为准；不替代法律意见。",
  };
}

export const STATE_LABEL: Record<FamilyState, string> = {
  message_only: "仅收到消息",
  joined_group: "已加群或已填写信息",
  remote_access: "已安装远程应用或开启屏幕共享",
  transferred: "已转账",
};
