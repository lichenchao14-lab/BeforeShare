import type { IntakeResult, Redaction } from "@/lib/types";

export const MAX_INPUT_LENGTH = 5000;

/** 输入边界校验，返回错误文案；通过时返回 null。 */
export function validateInput(raw: string): string | null {
  const text = raw.trim();
  if (text.length === 0) {
    return "请粘贴需要核验的消息内容";
  }
  if (text.length > MAX_INPUT_LENGTH) {
    return `内容过长（${text.length} 字），请精简到 ${MAX_INPUT_LENGTH} 字以内`;
  }
  return null;
}

const ID_PATTERN = /(?<!\d)\d{17}[\dXx](?!\d)/g;
const CARD_PATTERN = /(?<!\d)\d{16,19}(?!\d)/g;
const PHONE_PATTERN = /(?<!\d)(1[3-9]\d{9})(?!\d)/g;
// 只在明确的姓名语境下脱敏，避免把"中通快递客服"这类机构名当成姓名
const NAME_LABEL_PATTERN = /(?:我叫|姓名[:：]|联系人[:：]|收件人[:：])\s*([\u4e00-\u9fa5]{2,4})/g;
const NAME_SELF_PATTERN =
  /我是\s*([\u4e00-\u9fa5]{2,4})(?=先生|女士|老师|经理|警官|检察官|法官|同志|[，。！？、\s]|$)/g;
const ADDRESS_PATTERN =
  /[\u4e00-\u9fa5]{2,8}(?:省|自治区|市|区|县|镇|街道)[\u4e00-\u9fa5\d]{0,12}(?:\d+号|小区|大厦|栋|单元|室)/g;

/**
 * 本地脱敏：手机号、身份证、银行卡、姓名、详细地址替换为带序号的占位符。
 * 必须在任何网络请求之前调用；sanitizedText 是唯一允许外发的版本。
 */
export function sanitize(raw: string): IntakeResult {
  const redactions: Redaction[] = [];
  const counters: Partial<Record<Redaction["kind"], number>> = {};
  const seen = new Map<string, string>();

  const placeholderFor = (kind: Redaction["kind"], value: string): string => {
    const key = `${kind}:${value}`;
    const existing = seen.get(key);
    if (existing) return existing;
    const next = (counters[kind] ?? 0) + 1;
    counters[kind] = next;
    const placeholder = `<${kind.toUpperCase()}_${next}>`;
    seen.set(key, placeholder);
    redactions.push({ placeholder, kind });
    return placeholder;
  };

  let text = raw;
  // 身份证先于银行卡：18 位纯数字会同时命中两者
  text = text.replace(ID_PATTERN, (m) => placeholderFor("id", m));
  text = text.replace(CARD_PATTERN, (m) => placeholderFor("card", m));
  text = text.replace(PHONE_PATTERN, (m) => placeholderFor("phone", m));
  text = text.replace(NAME_LABEL_PATTERN, (m, name: string) =>
    m.replace(name, placeholderFor("name", name)),
  );
  text = text.replace(NAME_SELF_PATTERN, (m, name: string) =>
    m.replace(name, placeholderFor("name", name)),
  );
  text = text.replace(ADDRESS_PATTERN, (m) => placeholderFor("address", m));

  return { sanitizedText: text, redactions };
}

/** 关键词化：去掉空白，截断，用于检索式与留痕摘要 */
export function summarize(text: string, limit = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
}
