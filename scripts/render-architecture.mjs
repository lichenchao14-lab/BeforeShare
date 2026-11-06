/**
 * 生成两篇征文用的系统架构图（PNG）。
 * 用法：node scripts/render-architecture.mjs
 */
import puppeteer from "puppeteer-core";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

const FRAUD_STEPS = [
  ["本地脱敏", "号码、姓名、地址换占位符，外发的永远不是原件"],
  ["hy3 断言拆解", "结构化 JSON：断言 / 类型 / 特征 / 索要动作"],
  ["检索矩阵", "断言乘四方向，最多 12 路，并发 4"],
  ["去重与分级", "URL 与标题去重，域名分四级，相关度门槛"],
  ["四态裁决", "官方确证 > 高度可疑 > 存疑并列 > 无法判断"],
  ["三件物料", "套路解剖图 / 下一步统计 / 750px 家人提醒卡"],
];

const FRAUD_CHIPS = ["Industry = gov", "Freshness = y2", "Cnt = 20", "单案 619ms"];

const GUARDIAN_STEPS = [
  ["本地脱敏", "顺带记下转发背景：谁转的、转了几手"],
  ["主张拆解", "锚点：机构 / 文号 / 日期 / 数字 / 地名"],
  ["四方向溯源", "最早出处 / 原文版本 / 官方回应 / 权威转载"],
  ["同文归并", "同一内容多站出现，只留最早的一份"],
  ["一手判定", "时间最早 + 原始发布方 + 文本形态完整"],
  ["四档出处状态", "有据 / 转述 / 官方已回应 / 查不到"],
  ["出处卡", "750px，中立语气，可存图可转发"],
];

const GUARDIAN_CHIPS = ["≤12 路检索", "并发 4", "平均 247ms", "不判真假"];

function stepsHtml(steps) {
  return steps
    .map(
      (step, index) => `
      <div class="row">
        <div class="rail">
          <div class="num">${String(index + 1).padStart(2, "0")}</div>
          ${index < steps.length - 1 ? '<div class="line"></div>' : ""}
        </div>
        <div class="card">
          <div class="card-title">${step[0]}</div>
          <div class="card-detail">${step[1]}</div>
        </div>
      </div>`,
    )
    .join("");
}

function pageHtml({ title, subtitle, steps, chips, paper, accent, ink }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1080px;
    background: ${paper};
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    color: ${ink};
    padding: 44px 48px 40px;
  }
  .head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 30px; }
  .title { font-family: "Source Han Serif SC", "Songti SC", SimSun, serif; font-size: 30px; font-weight: 600; }
  .sub { font-size: 14px; color: #6b7772; margin-top: 8px; letter-spacing: 0.02em; }
  .tag { font-family: Consolas, monospace; font-size: 12px; color: ${accent}; border: 1px solid ${accent}33; background: ${accent}0f; padding: 5px 10px; border-radius: 999px; }
  .row { display: flex; gap: 20px; }
  .rail { width: 44px; display: flex; flex-direction: column; align-items: center; }
  .num {
    width: 38px; height: 38px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-family: Consolas, monospace; font-size: 13px;
    color: ${accent}; background: #fff; border: 1.5px solid ${accent}66; flex: none;
  }
  .line { width: 1.5px; flex: 1; background: ${accent}33; margin: 6px 0; }
  .card {
    flex: 1; background: #fff; border: 1px solid #e2e6e2;
    border-radius: 12px; padding: 16px 20px; margin-bottom: 14px;
    box-shadow: 0 10px 24px -22px rgba(30, 50, 40, 0.5);
  }
  .card-title { font-size: 18px; font-weight: 600; margin-bottom: 6px; }
  .card-detail { font-size: 14px; line-height: 1.65; color: #4f5b56; }
  .chips { display: flex; gap: 10px; margin-top: 26px; flex-wrap: wrap; padding-left: 64px; }
  .chip { font-family: Consolas, monospace; font-size: 12px; color: ${accent}; background: ${accent}0f; border: 1px solid ${accent}2e; border-radius: 999px; padding: 6px 12px; }
</style>
</head>
<body>
  <div class="head">
    <div>
      <div class="title">${title}</div>
      <div class="sub">${subtitle}</div>
    </div>
    <div class="tag">系统架构</div>
  </div>
  ${stepsHtml(steps)}
  <div class="chips">${chips.map((c) => `<span class="chip">${c}</span>`).join("")}</div>
</body>
</html>`;
}

async function shoot(browser, html, selector, output) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1200, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: "load" });
  const handle = await page.$(selector);
  if (!handle) throw new Error(`未找到 ${selector}`);
  await handle.screenshot({ path: output });
  await page.close();
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu"],
  });

  const fraudHtml = pageHtml({
    title: "反诈鉴谎师 · 核验链路",
    subtitle: "从一段转发话术到一张能发进家庭群的卡片",
    steps: FRAUD_STEPS,
    chips: FRAUD_CHIPS,
    paper: "#f7f5f0",
    accent: "#b9552f",
    ink: "#221f1c",
  });

  const guardianHtml = pageHtml({
    title: "家庭护卫哨 · 溯源链路",
    subtitle: "只查出处，不判真假",
    steps: GUARDIAN_STEPS,
    chips: GUARDIAN_CHIPS,
    paper: "#f4f6f5",
    accent: "#3f6b5f",
    ink: "#1f2724",
  });

  const fraudDir = join(process.cwd(), "screenshots");
  const guardianDir = join(process.cwd(), "apps", "guardian", "screenshots");
  if (!existsSync(fraudDir)) mkdirSync(fraudDir, { recursive: true });
  if (!existsSync(guardianDir)) mkdirSync(guardianDir, { recursive: true });

  await shoot(browser, fraudHtml, "body", join(fraudDir, "00-architecture.png"));
  await shoot(browser, guardianHtml, "body", join(guardianDir, "00-architecture.png"));

  await browser.close();
  console.log("done");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
