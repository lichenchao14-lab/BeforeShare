import type { Claim, ClaimType, DemandAction, FeatureTag, Verifiability } from "@/lib/types";

export class DecomposeError extends Error {}

export interface Decomposer {
  readonly mode: "llm" | "rule";
  decompose(text: string): Promise<Claim[]>;
}

const MAX_CLAIMS = 10;

const THREAT_WORDS = [
  "否则",
  "将会",
  "冻结",
  "扣费",
  "起诉",
  "逮捕",
  "通缉",
  "影响征信",
  "追究",
  "注销",
  "失效",
  "逾期",
  "安全账户",
  "洗钱",
  "涉嫌",
  "返利",
  "高额回报",
  "稳赚",
  "保本",
  "日息",
  "月息",
  "收益",
];

const ISOLATION_WORDS = [
  "不要告诉",
  "别告诉",
  "不要挂断",
  "不要挂电话",
  "不要联系",
  "保密",
  "独自",
  "不要报警",
  "不能告诉",
];

const DEMAND_RULES: { action: DemandAction; words: string[] }[] = [
  { action: "verification_code", words: ["验证码", "校验码", "动态码", "短信码"] },
  {
    action: "screen_share",
    words: ["屏幕共享", "共享屏幕", "远程协助", "远程控制", "会议软件", "投屏"],
  },
  {
    action: "transfer",
    words: [
      "转账",
      "汇款",
      "打款",
      "转入",
      "转到",
      "安全账户",
      "指定账户",
      "保证金",
      "解冻费",
      "刷流水",
    ],
  },
  { action: "install_app", words: ["下载", "安装", "App", "APK", "小程序"] },
  { action: "secrecy", words: ["保密", "不要告诉", "别告诉", "不能告诉"] },
];

const HOOK_WORDS = [
  "理赔",
  "退款",
  "返利",
  "中奖",
  "补贴",
  "贷款",
  "兼职",
  "刷单",
  "投资",
  "荐股",
  "客服",
  "会员",
  "包裹",
  "快递",
  "订单",
  "征信",
  "公检法",
  "社保",
];

const IDENTITY_WORDS = ["我是", "客服", "工作人员", "警官", "法官", "经理", "导师", "专员", "快递员"];
const PROCESS_WORDS = ["操作", "点击", "打开", "下载", "安装", "扫码", "填写", "发送", "提供", "确认"];
const MONEY_WORDS = ["元", "万元", "转账", "汇款", "理赔", "退款", "费用", "保证金", "贷款", "刷单"];

const VERIFIABLE_WORDS = [
  "客服",
  "官方",
  "平台",
  "银行",
  "公安",
  "法院",
  "政策",
  "规定",
  "号码",
  "网址",
  "链接",
  "App",
  "小程序",
  "公司",
  "机构",
  "快递",
  "订单",
  "下载",
  "安装",
  "屏幕共享",
  "验证码",
  "转账",
  "汇款",
  "打款",
  "借钱",
  "兼职",
  "返利",
  "刷单",
  "佣金",
  "提现",
  "投资",
  "养老",
  "项目",
  "名额",
  "签约",
  "购物卡",
  "保证金",
  "贷款",
  "中奖",
  "理赔",
  "退款",
];

const SUBJECTIVE_WORDS = ["态度", "语气", "感觉", "听起来", "好像", "似乎", "看起来"];

function pickType(sentence: string): ClaimType {
  if (MONEY_WORDS.some((w) => sentence.includes(w))) return "money";
  if (IDENTITY_WORDS.some((w) => sentence.includes(w))) return "identity";
  if (PROCESS_WORDS.some((w) => sentence.includes(w))) return "process";
  return "fact";
}

function pickVerifiability(sentence: string): Verifiability {
  if (VERIFIABLE_WORDS.some((w) => sentence.includes(w))) return "verifiable";
  if (/\d+(?:万|元|块)/.test(sentence)) return "verifiable";
  if (SUBJECTIVE_WORDS.some((w) => sentence.includes(w))) return "unverifiable";
  // 默认按可核验处理：常见骗局话术都能与公开通报做模式比对
  return "verifiable";
}

function pickFeatures(sentence: string, demands: DemandAction[]): FeatureTag[] {
  const tags: FeatureTag[] = [];
  if (HOOK_WORDS.some((w) => sentence.includes(w))) tags.push("hook");
  if (THREAT_WORDS.some((w) => sentence.includes(w))) tags.push("threat");
  if (ISOLATION_WORDS.some((w) => sentence.includes(w))) tags.push("isolation");
  if (demands.length > 0) tags.push("demand");
  return tags;
}

function pickDemands(sentence: string): DemandAction[] {
  return DEMAND_RULES.filter((rule) => rule.words.some((w) => sentence.includes(w))).map(
    (rule) => rule.action,
  );
}

const SPLIT_PATTERN = /[。！？!?\n；;]+/;

/**
 * 规则版拆解：无大模型可用时的降级实现，也是回归测试的确定性基线。
 * 只按标点切句并做关键词标注，绝不引入原文没有的事实。
 */
export const ruleDecomposer: Decomposer = {
  mode: "rule",
  async decompose(text: string): Promise<Claim[]> {
    const sentences = text
      .split(SPLIT_PATTERN)
      .map((s) => s.trim())
      .filter((s) => s.length >= 6);

    const claims: Claim[] = [];
    for (const sentence of sentences) {
      const demands = pickDemands(sentence);
      const features = pickFeatures(sentence, demands);
      if (features.length === 0) continue;
      claims.push({
        id: `c${claims.length + 1}`,
        excerpt: sentence,
        type: pickType(sentence),
        verifiability: pickVerifiability(sentence),
        features,
        demands,
      });
      if (claims.length >= MAX_CLAIMS) break;
    }

    if (claims.length === 0) {
      throw new DecomposeError(
        "未能从这段内容中提取出可核验的表述。请补充对方身份、事由以及要求你做的动作。",
      );
    }
    return claims;
  },
};

/**
 * 选择拆解器：配置了大模型则优先用 LLM，调用失败时退回规则版。
 */
export async function createDecomposer(): Promise<Decomposer> {
  // 显式指定 rule 时跳过模型，便于复现规则模式的耗时与截图
  if (process.env.DECOMPOSER_MODE === "rule") return ruleDecomposer;
  if (process.env.LLM_BASE_URL && process.env.LLM_API_KEY) {
    const { llmDecomposer } = await import("./llm-decomposer");
    return {
      mode: "llm",
      async decompose(text: string) {
        try {
          return await llmDecomposer.decompose(text);
        } catch (error) {
          // 演示环境里网络或额度抖动时，规则版保证流程不中断
          console.warn(
            "[decomposer] 大模型拆解失败，已降级到规则模式：",
            error instanceof Error ? error.message : error,
          );
          return ruleDecomposer.decompose(text);
        }
      },
    };
  }
  return ruleDecomposer;
}
