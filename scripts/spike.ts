/**
 * Spike：用 5 条预置话术跑通 SearchPro，统计一级官方信源占比。
 * 用法：npm run spike
 * 需要项目根目录的 .env.local 中配置 TENCENTCLOUD_WSA_APIKEY。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const ENV_FILE = join(ROOT, ".env.local");

function loadEnv(): void {
  if (!existsSync(ENV_FILE)) return;
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const value = match[2].replace(/^["']|["']$/g, "");
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

async function main(): Promise<void> {
  loadEnv();

  if (!process.env.TENCENTCLOUD_WSA_APIKEY) {
    console.error(
      "缺少 TENCENTCLOUD_WSA_APIKEY。\n请先在元宝搜索控制台创建 API KEY，写入 .env.local 后重跑：\n",
    );
    console.error("  TENCENTCLOUD_WSA_APIKEY=sk-xxxx\n");
    process.exit(2);
  }

  const { FIXTURES } = await import("../src/lib/fixtures/cases");
  const { verify } = await import("../src/lib/pipeline");

  const rows: string[] = [];
  const report: Record<string, unknown>[] = [];

  for (const fixture of FIXTURES) {
    try {
      const result = await verify(fixture.text, fixture.state);
      const total = result.evidence.length;
      const official = result.evidence.filter((e) => e.level === 1).length;
      const mediaStrong = result.evidence.filter((e) => e.level <= 2).length;
      const ratio = total === 0 ? 0 : official / total;

      rows.push(
        [
          fixture.name,
          String(result.claims.length),
          String(result.trace.totalQueries),
          String(total),
          String(official),
          `${(ratio * 100).toFixed(0)}%`,
          String(mediaStrong),
          result.verdict?.overall ?? "无结论",
          `${result.trace.totalDurationMs}ms`,
        ].join(" | "),
      );

      report.push({
        id: fixture.id,
        name: fixture.name,
        expect: fixture.expect,
        actual: result.verdict?.overall ?? null,
        claims: result.claims.length,
        queries: result.trace.totalQueries,
        evidenceTotal: total,
        officialCount: official,
        officialRatio: Number(ratio.toFixed(2)),
        strongCount: mediaStrong,
        durationMs: result.trace.totalDurationMs,
        topSources: result.evidence.slice(0, 5).map((e) => ({
          level: e.level,
          site: e.site,
          date: e.publishedAt,
          title: e.title,
        })),
      });
    } catch (error) {
      rows.push(`${fixture.name} | 失败：${error instanceof Error ? error.message : "未知错误"}`);
      report.push({ id: fixture.id, name: fixture.name, error: String(error) });
    }
  }

  const header =
    "案例 | 断言 | 检索 | 证据 | 官方 | 官方占比 | 二级以上 | 结论 | 耗时";
  console.log(header);
  console.log("-".repeat(header.length));
  for (const row of rows) console.log(row);

  const outDir = join(ROOT, ".spike");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "spike-report.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(`\n完整结果已写入 .spike/spike-report.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
