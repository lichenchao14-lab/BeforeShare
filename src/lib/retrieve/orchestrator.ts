import type { Claim, QueryTrace } from "@/lib/types";
import { buildQueryPlans, type QueryPlan } from "./query-matrix";
import { searchWsa, type RawSearchResult, type SearchTuning } from "./wsa";

export interface RetrievedItem {
  claimId: string;
  direction: QueryPlan["direction"];
  result: RawSearchResult;
}

export interface RetrievalOutcome {
  items: RetrievedItem[];
  traces: QueryTrace[];
  trimmedQueries: string[];
  allFailed: boolean;
  usedCapabilities: { timeRange: boolean; siteFilter: boolean };
}

const TIMEOUT_MS = Number(process.env.WSA_TIMEOUT_MS ?? 8000);
const MAX_REQUESTS = Number(process.env.WSA_MAX_REQUESTS ?? 12);
const CONCURRENCY = Math.max(1, Number(process.env.WSA_CONCURRENCY ?? 4));

/** 按检索方向调参：官方方向走政府垂直领域，其余限定时效 */
const TUNING_BY_DIRECTION: Record<QueryPlan["direction"], SearchTuning> = {
  official: { industry: "gov", cnt: 20, freshness: "y2" },
  pattern: { cnt: 20, freshness: "y2" },
  channel: { cnt: 10 },
  cases: { cnt: 20, freshness: "y2" },
};

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await tasks[index]();
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * 检索编排：并发受限、总量受限、单路失败不阻断整体，全过程写入留痕。
 * 全量失败时 allFailed=true，上层据此拒绝给出任何风险结论。
 */
export async function retrieve(
  claims: Claim[],
  sourceText: string,
): Promise<RetrievalOutcome> {
  const { plans, trimmed } = buildQueryPlans(claims, sourceText, MAX_REQUESTS);

  const tasks = plans.map((plan) => async () => {
    const startedAt = Date.now();
    try {
      const results = await searchWsa(plan.query, {
        timeoutMs: TIMEOUT_MS,
        retries: 1,
        tuning: TUNING_BY_DIRECTION[plan.direction],
      });
      const durationMs = Date.now() - startedAt;
      return {
        plan,
        results,
        trace: {
          query: plan.query,
          claimId: plan.claimId,
          direction: plan.direction,
          durationMs,
          resultCount: results.length,
          status: "ok" as const,
        },
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const isTimeout = error instanceof Error && error.name === "AbortError";
      return {
        plan,
        results: [] as RawSearchResult[],
        trace: {
          query: plan.query,
          claimId: plan.claimId,
          direction: plan.direction,
          durationMs,
          resultCount: 0,
          status: isTimeout ? ("timeout" as const) : ("error" as const),
          error: error instanceof Error ? error.message : "未知错误",
        },
      };
    }
  });

  const settled = await runWithConcurrency(tasks, CONCURRENCY);

  const items: RetrievedItem[] = [];
  for (const entry of settled) {
    for (const result of entry.results) {
      items.push({ claimId: entry.plan.claimId, direction: entry.plan.direction, result });
    }
  }

  const traces = settled.map((entry) => entry.trace);
  const allFailed = traces.length === 0 || traces.every((t) => t.resultCount === 0);

  return {
    items,
    traces,
    trimmedQueries: trimmed.map((p) => p.query),
    allFailed,
    usedCapabilities: { timeRange: true, siteFilter: false },
  };
}
