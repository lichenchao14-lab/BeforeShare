/** 核验链路共用的数据类型。字段命名对齐 design.md 的"关键数据形状"。 */

export type ClaimType = "fact" | "identity" | "process" | "money";
export type Verifiability = "verifiable" | "unverifiable";

/** 可疑特征：钩子 / 恐吓或利诱 / 孤立 / 索要 */
export type FeatureTag = "hook" | "threat" | "isolation" | "demand";

/** 索要的具体对象，用于后续动作预判的统计口径 */
export type DemandAction =
  | "verification_code"
  | "screen_share"
  | "transfer"
  | "install_app"
  | "secrecy";

export interface Claim {
  id: string;
  excerpt: string;
  type: ClaimType;
  verifiability: Verifiability;
  features: FeatureTag[];
  demands: DemandAction[];
}

/** 1 官方 / 2 央媒与主流媒体 / 3 行业机构与平台公告 / 4 个人发帖与自媒体 */
export type SourceLevel = 1 | 2 | 3 | 4;

export interface Evidence {
  id: string;
  claimId: string;
  title: string;
  url: string;
  site: string;
  publishedAt: string | null;
  passage: string;
  level: SourceLevel;
  score: number;
  mergedFrom: number;
  isOldCase: boolean;
}

export type ClaimVerdictState =
  | "official_confirmed"
  | "highly_suspicious"
  | "conflicting"
  | "undetermined";

export interface ClaimVerdict {
  claimId: string;
  state: ClaimVerdictState;
  reason: string;
  evidenceIds: string[];
}

export type OverallRisk = "high" | "suspicious" | "undetermined" | "no_anomaly";
export type Confidence = "high" | "medium" | "low";

export interface Verdict {
  claims: ClaimVerdict[];
  overall: OverallRisk;
  confidence: Confidence;
  confidenceBasis: string;
}

/** 家人当前所处步骤，决定行动建议的强度 */
export type FamilyState =
  | "message_only"
  | "joined_group"
  | "remote_access"
  | "transferred";

export type RedactionKind = "phone" | "id" | "card" | "name" | "address";

export interface Redaction {
  placeholder: string;
  kind: RedactionKind;
}

export interface IntakeResult {
  sanitizedText: string;
  redactions: Redaction[];
}

export type QueryDirection = "pattern" | "official" | "channel" | "cases";

export interface QueryTrace {
  query: string;
  claimId: string;
  direction: QueryDirection;
  durationMs: number;
  resultCount: number;
  status: "ok" | "error" | "timeout";
  error?: string;
  trimmed?: boolean;
}

export interface AuditTrace {
  startedAt: string;
  finishedAt: string;
  totalDurationMs: number;
  totalQueries: number;
  sanitizedSummary: string;
  claims: Claim[];
  queries: QueryTrace[];
}

/** 套路解剖四段 */
export type AnatomySegment = "hook" | "threat" | "isolation" | "demand";

export interface AnatomyRow {
  segment: AnatomySegment;
  hit: boolean;
  excerpt: string | null;
}

export interface Foresight {
  totalCases: number;
  items: { action: DemandAction; count: number }[];
}

export interface FamilyBrief {
  conclusion: string;
  evidence: { title: string; site: string; publishedAt: string | null; url?: string }[];
  action: string;
  channel: string | null;
  disclaimer: string;
}

export interface ActionItem {
  order: number;
  text: string;
}

export interface ActionPlan {
  state: FamilyState;
  items: ActionItem[];
  emergency: boolean;
  disclaimer: string;
}

export interface VerificationResult {
  intake: IntakeResult;
  claims: Claim[];
  evidence: Evidence[];
  peripheral: Evidence[];
  verdict: Verdict | null;
  anatomy: AnatomyRow[] | null;
  foresight: Foresight | null;
  brief: FamilyBrief | null;
  plan: ActionPlan;
  trace: AuditTrace;
  failure: string | null;
}
