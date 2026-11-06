import type { Claim, ClaimType, DemandAction, FeatureTag, Verifiability } from "@/lib/types";
import { DecomposeError, type Decomposer } from "./decomposer";

const MAX_CLAIMS = 10;

/** 从网关地址里取出环境 ID，形如 https://<env>.api.tcloudbasegateway.com/... */
function envIdFromBaseUrl(baseUrl: string | undefined): string {
  if (!baseUrl) return "";
  try {
    const host = new URL(baseUrl).hostname;
    return host.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

const SYSTEM_PROMPT = `你是反诈信息核验系统的断言拆解器。把用户给出的可疑消息拆成可被外部证据验证的断言。

硬性规则：
1. 只使用原文中出现的信息，禁止补充原文没有的机构名、金额、姓名或事实。
2. 输出 1 到 ${MAX_CLAIMS} 条断言。
3. 每条断言的 excerpt 必须是原文的连续片段。
4. type 取值：fact（事实陈述）/ identity（身份声称）/ process（要求操作）/ money（涉及资金）。
5. verifiability 取值：verifiable（可通过公开信息查证）/ unverifiable（主观描述或无法查证）。
6. features 取值集合：hook（事由钩子）/ threat（恐吓或利诱）/ isolation（要求保密或阻断求助）/ demand（索要动作）。
7. demands 仅可取：verification_code / screen_share / transfer / install_app / secrecy，没有则给空数组。

只输出 JSON 数组，不要任何解释文字。数组元素形如：
{"excerpt":"...","type":"fact","verifiability":"verifiable","features":["hook"],"demands":[]}`;

const VALID_TYPES: ClaimType[] = ["fact", "identity", "process", "money"];
const VALID_VERIFIABILITY: Verifiability[] = ["verifiable", "unverifiable"];
const VALID_FEATURES: FeatureTag[] = ["hook", "threat", "isolation", "demand"];
const VALID_DEMANDS: DemandAction[] = [
  "verification_code",
  "screen_share",
  "transfer",
  "install_app",
  "secrecy",
];

interface RawClaim {
  excerpt?: unknown;
  type?: unknown;
  verifiability?: unknown;
  features?: unknown;
  demands?: unknown;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function normalize(raw: RawClaim, index: number, sourceText: string): Claim | null {
  const excerpt = typeof raw.excerpt === "string" ? raw.excerpt.trim() : "";
  // 防幻觉：断言片段必须真实出现在原文中
  if (excerpt.length < 4 || !sourceText.includes(excerpt)) return null;

  const type = VALID_TYPES.includes(raw.type as ClaimType) ? (raw.type as ClaimType) : "fact";
  const features = asStringArray(raw.features).filter((f): f is FeatureTag =>
    VALID_FEATURES.includes(f as FeatureTag),
  );
  const demands = asStringArray(raw.demands).filter((d): d is DemandAction =>
    VALID_DEMANDS.includes(d as DemandAction),
  );
  // 模型给出的 verifiability 不稳定：身份声称与含索要/施压动作的断言一律视为可核验
  const actionable =
    type === "identity" ||
    demands.length > 0 ||
    features.includes("demand") ||
    features.includes("threat");
  const verifiability: Verifiability = actionable
    ? "verifiable"
    : VALID_VERIFIABILITY.includes(raw.verifiability as Verifiability)
      ? (raw.verifiability as Verifiability)
      : "unverifiable";

  return {
    id: `c${index + 1}`,
    excerpt,
    type,
    verifiability,
    features: features.length > 0 ? features : demands.length > 0 ? ["demand"] : [],
    demands,
  };
}

export const llmDecomposer: Decomposer = {
  mode: "llm",
  async decompose(text: string): Promise<Claim[]> {
    const apiKey = process.env.LLM_API_KEY;
    // CloudBase 成长计划只允许 SDK 通道，直连 HTTP 会返回 AI_CHANNEL_NOT_ALLOWED
    const envId = process.env.LLM_ENV_ID || envIdFromBaseUrl(process.env.LLM_BASE_URL);
    if (!envId || !apiKey) {
      throw new DecomposeError("大模型未配置");
    }
    // 可以在控制台开启多个模型，默认用成长计划自带的 hy3
    const model = process.env.LLM_MODEL || "hy3";

    const tcb = (await import("@cloudbase/node-sdk")).default;
    const app = tcb.init({ env: envId, accessKey: apiKey, timeout: 30000 });
    const ai = (app as unknown as { ai: () => { createModel: (name: string) => unknown } }).ai();
    const chatModel = ai.createModel("cloudbase") as {
      generateText: (options: {
        model: string;
        messages: { role: string; content: string }[];
      }) => Promise<{ text?: string }>;
    };

    let content = "";
    try {
      const result = await chatModel.generateText({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
      });
      content = (result.text ?? "").trim();
    } catch (error) {
      throw new DecomposeError(
        `大模型调用失败：${error instanceof Error ? error.message : "未知错误"}`,
      );
    }

    // 兼容 ```json 包裹与前后多余文字
    content = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new DecomposeError("大模型返回内容无法解析");
    }

    // 兼容数组或 {claims:[...]} 两种返回形状
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { claims?: unknown }).claims)
        ? (parsed as { claims: RawClaim[] }).claims
        : [];

    const claims = list
      .slice(0, MAX_CLAIMS)
      .map((item, index) => normalize(item as RawClaim, index, text))
      .filter((c): c is Claim => c !== null);

    if (claims.length === 0) {
      throw new DecomposeError(
        "未能从这段内容中提取出可核验的表述。请补充对方身份、事由以及要求你做的动作。",
      );
    }
    return claims;
  },
};
