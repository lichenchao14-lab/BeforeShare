/** 取一条真实查询的最新结果，用于征文里“分钟级更新”的具体例子 */
import { readFileSync } from "node:fs";

const raw = readFileSync(".env.local", "utf8");
for (const line of raw.split(/\r?\n/)) {
  if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
  const index = line.indexOf("=");
  const key = line.slice(0, index).trim();
  const value = line.slice(index + 1).trim();
  if (!process.env[key]) process.env[key] = value;
}

async function main() {
  const { searchWsa } = await import("../src/lib/retrieve/wsa");
  const results = await searchWsa("快递理赔 诈骗 警方通报", {
    timeoutMs: 8000,
    tuning: { industry: "gov", freshness: "y2", cnt: 20 },
  });
  const sorted = results
    .filter((item: { date: string | null }) => item.date)
    .sort((a: { date: string | null }, b: { date: string | null }) =>
      (b.date ?? "").localeCompare(a.date ?? ""),
    )
    .slice(0, 6);
  console.log("total:", results.length);
  for (const item of sorted) {
    console.log(`${item.date} | ${item.site} | ${item.title}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
