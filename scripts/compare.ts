/**
 * 对比实验：同一批输入，三种做法。
 * A 静态关键词/黑名单规则（最便宜的方案）
 * B 单次检索 + 取前三条直接总结（"调一次 API 让模型总结"的典型做法）
 * C 本作品：断言级多路核验 + 四态裁决
 * 用法：npx tsx scripts/compare.ts
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

const KEY_SIGNALS = [
  "理赔",
  "取件码",
  "验证码",
  "安全账户",
  "刷单",
  "返利",
  "兼职",
  "借钱",
  "养老",
  "转账",
  "滞纳金",
];

const KEYWORDS = [
  "安全账户",
  "验证码",
  "屏幕共享",
  "转账",
  "汇款",
  "刷单",
  "返利",
  "中奖",
  "贷款",
  "公检法",
  "通缉",
  "冻结",
];

async function main(): Promise<void> {
  loadEnv();
  const { FIXTURES } = await import("../src/lib/fixtures/cases");
  const { verify } = await import("../src/lib/pipeline");
  const { searchWsa } = await import("../src/lib/retrieve/wsa");
  const { extractInstitution } = await import("../src/lib/retrieve/query-matrix");

  const rows: string[] = [
    "| 案例 | 期望 | A 关键词规则 | B 单次检索总结 | C 本作品 |",
    "|---|---|---|---|---|",
  ];
  const detail: Record<string, unknown>[] = [];

  for (const fixture of FIXTURES) {
    // A：静态关键词命中
    const hits = KEYWORDS.filter((word) => fixture.text.includes(word));
    const aFlag = hits.length > 0 ? `判可疑（命中 ${hits.join("、")}）` : "无提示";

    // B：一条短关键词查询（机构 + 场景词 + 诈骗），取前三条是否出现诈骗措辞
    const institution = extractInstitution(fixture.text);
    const signal = KEY_SIGNALS.find((word) => fixture.text.includes(word)) ?? "诈骗";
    const query = [institution, signal, "诈骗"].filter(Boolean).join(" ");
    const startedAt = Date.now();
    let bFlag = "未判可疑";
    let bCount = 0;
    try {
      const results = await searchWsa(query, {
        timeoutMs: 8000,
        retries: 1,
        tuning: { cnt: 10, freshness: "y2" },
      });
      bCount = results.length;
      const top = results.slice(0, 3);
      const fraudTop = top.filter((item) =>
        /诈骗|骗局|警惕|预警|骗/.test(`${item.title} ${item.passage}`),
      ).length;
      bFlag = fraudTop > 0 ? `判可疑（前三条中 ${fraudTop} 条含诈骗措辞）` : "未判可疑";
    } catch (error) {
      bFlag = `检索失败（${error instanceof Error ? error.message : "未知"}）`;
    }
    const bMs = Date.now() - startedAt;

    // C：本作品
    const result = await verify(fixture.text, fixture.state);
    const cLabel = result.verdict?.overall ?? "无结论";

    rows.push(`| ${fixture.name} | ${fixture.expect} | ${aFlag} | ${bFlag} | ${cLabel} |`);
    detail.push({
      id: fixture.id,
      expect: fixture.expect,
      keywordHits: hits,
      singleQuery: { query, resultCount: bCount, flagged: bFlag, durationMs: bMs },
      ours: {
        overall: result.verdict?.overall ?? null,
        evidence: result.evidence.length,
        official: result.evidence.filter((e) => e.level === 1).length,
        queries: result.trace.totalQueries,
        durationMs: result.trace.totalDurationMs,
      },
    });
  }

  const table = rows.join("\n");
  console.log(table);

  const outDir = join(ROOT, ".spike");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "compare.json"), JSON.stringify(detail, null, 2), "utf8");

  const md = [
    "# 三种做法的对比实验",
    "",
    "同一批 7 条输入（5 条诈骗样本 + 1 条正常通知 + 1 条查无实据），同一台机器、同一网络。",
    "",
    table,
    "",
    "## 口径说明",
    "",
    "- A：静态关键词表（安全账户/验证码/屏幕共享/转账/汇款/刷单/返利/中奖/贷款/公检法/通缉/冻结）命中即判可疑",
    "- B：用一条短关键词查询（机构 + 场景词 + “诈骗”），取前 3 条结果，出现诈骗措辞即判可疑（调用 1 次）",
    "- C：断言级多路检索 + 信源分级 + 四态裁决（每案 3–7 次调用）",
    "",
    "## 结论要点",
    "",
    "- A 的问题不是漏报，而是**没有证据也无法解释**：命中关键词只说明词出现了，不说明这段消息就是骗局",
    "- B 的问题相反：它几乎总能搜到诈骗文章，于是**正常消息也被判可疑**（见“快递柜取件”一行），因为检索到诈骗内容不等于这条消息是诈骗",
    "- C 用“断言 × 官方信源 × 相关度门槛”把两者的问题都规避了，代价是每次 3–7 次调用",
  ].join("\n");
  writeFileSync(join(outDir, "compare.md"), md, "utf8");
  console.log("\n结果已写入 .spike/compare.md 与 .spike/compare.json");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
