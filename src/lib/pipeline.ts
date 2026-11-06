import { buildActionPlan, buildBrief } from "@/lib/brief/materials";
import { createDecomposer, ruleDecomposer } from "@/lib/decompose/decomposer";
import { buildAnatomy, buildForesight } from "@/lib/explain/anatomy";
import { grade } from "@/lib/grade/grading";
import { sanitize, summarize, validateInput } from "@/lib/intake/sanitize";
import { retrieve } from "@/lib/retrieve/orchestrator";
import { extractInstitution } from "@/lib/retrieve/query-matrix";
import type { Claim, FamilyState, VerificationResult } from "@/lib/types";
import { adjudicate } from "@/lib/verdict/adjudicate";

export class IntakeError extends Error {}

/**
 * 主链路：脱敏 → 拆解 → 检索 → 分级 → 裁决 → 物料。
 * 每一步都可单独替换；检索全量失败时不产出任何风险结论。
 */
export async function verify(
  rawText: string,
  familyState: FamilyState,
): Promise<VerificationResult> {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();

  const inputError = validateInput(rawText);
  if (inputError) throw new IntakeError(inputError);

  const intake = sanitize(rawText);

  // 拆解：优先 LLM，失败或未配置时降级到规则版
  let claims: Claim[];
  const decomposer = await createDecomposer();
  try {
    claims = await decomposer.decompose(intake.sanitizedText);
  } catch (error) {
    if (decomposer.mode === "llm") {
      claims = await ruleDecomposer.decompose(intake.sanitizedText);
    } else {
      throw error;
    }
  }

  const noVerifiable = claims.every((c) => c.verifiability !== "verifiable");
  if (noVerifiable) {
    return {
      intake,
      claims,
      evidence: [],
      peripheral: [],
      verdict: null,
      anatomy: buildAnatomy(claims),
      foresight: null,
      brief: null,
      plan: buildActionPlan(familyState),
      trace: {
        startedAt,
        finishedAt: new Date().toISOString(),
        totalDurationMs: Date.now() - startedMs,
        totalQueries: 0,
        sanitizedSummary: summarize(intake.sanitizedText),
        claims,
        queries: [],
      },
      failure:
        "这段内容里没有可外部核验的表述。请补充对方身份、事由或要求你做的具体动作后再试。",
    };
  }

  const outcome = await retrieve(claims, intake.sanitizedText);
  const finishedAt = new Date().toISOString();
  const baseTrace = {
    startedAt,
    finishedAt,
    totalDurationMs: Date.now() - startedMs,
    totalQueries: outcome.traces.length,
    sanitizedSummary: summarize(intake.sanitizedText),
    claims,
    queries: outcome.traces,
  };

  // 全量失败：不给结论，只给失败原因与重试入口
  if (outcome.allFailed) {
    return {
      intake,
      claims,
      evidence: [],
      peripheral: [],
      verdict: null,
      anatomy: null,
      foresight: null,
      brief: null,
      plan: buildActionPlan(familyState),
      trace: baseTrace,
      failure: "核验未完成：检索服务未返回有效结果，请稍后重试。",
    };
  }

  const { evidence, peripheral } = grade(outcome.items, claims);
  const verdict = adjudicate(claims, evidence);
  const anatomy = buildAnatomy(claims);
  const foresight = buildForesight(evidence);
  const institution = extractInstitution(intake.sanitizedText);
  const plan = buildActionPlan(familyState);
  const brief = buildBrief({
    overall: verdict.overall,
    evidence,
    firstAction: plan.items[0]?.text ?? "先停止与对方的任何操作，通过官方渠道核实",
    institution,
  });

  return {
    intake,
    claims,
    evidence,
    peripheral,
    verdict,
    anatomy,
    foresight,
    brief,
    plan,
    trace: baseTrace,
    failure: null,
  };
}
