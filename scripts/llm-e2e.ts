/** 端到端验证：LLM 拆解 + 检索 + 裁决，全部走真实环境 */
import { readFileSync } from "node:fs";

const raw = readFileSync(".env.local", "utf8");
for (const line of raw.split(/\r?\n/)) {
  if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
  const index = line.indexOf("=");
  const key = line.slice(0, index).trim();
  const value = line.slice(index + 1).trim();
  if (!process.env[key]) process.env[key] = value;
}

const sample =
  "您好，我是中通快递客服，您的包裹在运输中破损，我们可以为您办理三倍理赔。请添加理赔专员微信，下载会议软件并开启屏幕共享，按指引填写银行卡号和短信验证码完成退款。";

async function main() {
  const started = Date.now();
  const { verify } = await import("../src/lib/pipeline");
  const result = await verify(sample, "remote_access");
  const wall = Date.now() - started;
  console.log(
    JSON.stringify(
      {
        wallMs: wall,
        serverMs: result.trace.totalDurationMs,
        queries: result.trace.totalQueries,
        claims: result.claims.length,
        evidence: result.evidence.length,
        level1: result.evidence.filter((e) => e.level === 1).length,
        verdict: result.verdict,
        anatomy: result.anatomy?.length ?? 0,
        brief: result.brief !== null,
        planKeys: Object.keys(result.plan ?? {}),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("E2E_FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
