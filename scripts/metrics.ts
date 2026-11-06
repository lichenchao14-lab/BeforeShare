/**
 * 采集元宝搜索的产品能力指标，供征文使用。
 * 用法：npx tsx scripts/metrics.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ENV = join(process.cwd(), ".env.local");
if (existsSync(ENV)) {
  for (const line of readFileSync(ENV, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

async function main() {
  const { verify } = await import("../src/lib/pipeline");
  const { FIXTURES } = await import("../src/lib/fixtures/cases");

  const fixtures = FIXTURES.slice(0, 5);
  const rows: Record<string, unknown>[] = [];

  for (const fixture of fixtures) {
    const result = await verify(fixture.text, fixture.state);
    const passages = result.evidence.map((e) => e.passage.length);
    const avgPassage = passages.length
      ? Math.round(passages.reduce((a, b) => a + b, 0) / passages.length)
      : 0;
    const durations = result.trace.queries.map((q) => q.durationMs);
    const dates = result.evidence
      .map((e) => e.publishedAt)
      .filter((d): d is string => Boolean(d))
      .map((d) => d.replace(/\//g, "-").slice(0, 10))
      .sort();

    rows.push({
      id: fixture.id,
      evidence: result.evidence.length,
      official: result.evidence.filter((e) => e.level === 1).length,
      avgPassageChars: avgPassage,
      minQueryMs: Math.min(...durations),
      maxQueryMs: Math.max(...durations),
      avgQueryMs: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      earliestDate: dates[0] ?? null,
      latestDate: dates[dates.length - 1] ?? null,
      totalPassageChars: passages.reduce((a, b) => a + b, 0),
    });
  }

  console.log(JSON.stringify(rows, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
