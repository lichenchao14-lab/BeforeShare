/** 验证 CloudBase 模型接入：node 环境读取 .env.local 后调用断言拆解器 */
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
  const { createDecomposer } = await import("../src/lib/decompose/decomposer");
  const decomposer = await createDecomposer();
  const claims = await decomposer.decompose(sample);
  console.log("mode:", decomposer.mode, "ms:", Date.now() - started, "claims:", claims.length);
  for (const claim of claims) {
    console.log(
      `- ${claim.excerpt.slice(0, 40)} | ${claim.type} | ${claim.verifiability} | ${claim.features.join("/")} | ${claim.demands.join("/") || "无索要"}`,
    );
  }
}

main().catch((error) => {
  console.error("PROBE_FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
