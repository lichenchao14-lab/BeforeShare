/**
 * 对照组：拿三条确实存在的官方通报标题去查，验证“按标题检索能否命中原文”。
 * 如果对照组命中、hy3 编的标题查不到，那“查无此文”才站得住。
 */
import { readFileSync } from "node:fs";

const raw = readFileSync(".env.local", "utf8");
for (const line of raw.split(/\r?\n/)) {
  if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
  const index = line.indexOf("=");
  const key = line.slice(0, index).trim();
  const value = line.slice(index + 1).trim();
  if (!process.env[key]) process.env[key] = value;
}

const REAL_TITLES = [
  "物流异常来电？小心骗局",
  "屏幕共享？谨防骗局！",
  "98万元！临渭公安站南派出所紧急止付成功挽损",
];

function stripPunct(s: string): string {
  return s.replace(/[\s：:，,。、“”"'！!？?—\-–·|《》()（）]/g, "");
}

async function main() {
  const { searchWsa } = await import("../src/lib/retrieve/wsa");
  for (const title of REAL_TITLES) {
    const results = await searchWsa(title, { timeoutMs: 8000, tuning: { cnt: 10 } });
    const probe = stripPunct(title).slice(0, 14);
    const hit = results.find((r) => stripPunct(r.title).includes(probe));
    console.log(
      `${hit ? "命中" : "未命中"} | 查询：${title} | 返回 ${results.length} 条${hit ? ` | ${hit.date ?? "无日期"} | ${hit.site}` : ""}`,
    );
    if (!hit) {
      for (const r of results.slice(0, 3)) console.log(`    返回：${r.date ?? "无日期"} | ${r.title}`);
    }
  }
}

main().catch((error) => {
  console.error("PROBE_FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
