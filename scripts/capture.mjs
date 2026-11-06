import puppeteer from "puppeteer-core";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = "http://localhost:3000";
const OUT = join(process.cwd(), "screenshots");

const CASES = [
  {
    id: "high",
    file: "快递理赔",
    stateLabel: "已安装远程应用或开启屏幕共享",
    text: "您好，我是中通快递客服，您的包裹在运输中破损，我们可以为您办理三倍理赔。请添加理赔专员微信，下载会议软件并开启屏幕共享，按指引填写银行卡号和短信验证码完成退款。",
  },
  {
    id: "normal",
    file: "快递柜取件",
    stateLabel: "仅收到消息",
    text: "您好，您的顺丰快递已放置小区丰巢柜，取件码 123456，请在两日内取件，超时退回。查询可拨打顺丰官方客服电话 95338。",
  },
  {
    id: "unknown",
    file: "读书会逾期",
    stateLabel: "仅收到消息",
    text: "您好，我们是青禾读书会客服，您上月借阅的山月记已逾期三天，请今天内归还到前台，逾期会产生滞纳金。",
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function clickByText(page, selector, text) {
  const clicked = await page.evaluate(
    (sel, txt) => {
      const nodes = [...document.querySelectorAll(sel)];
      const target = nodes.find((node) => node.textContent && node.textContent.includes(txt));
      if (!target) return false;
      target.click();
      return true;
    },
    selector,
    text,
  );
  if (!clicked) throw new Error(`找不到包含「${text}」的 ${selector}`);
}

async function scrollToText(page, text) {
  await page.evaluate((txt) => {
    const nodes = [...document.querySelectorAll("h1,h2,section")];
    const target = nodes.find((node) => node.textContent && node.textContent.includes(txt));
    target?.scrollIntoView({ block: "start" });
  }, text);
  await sleep(600);
}

async function fillAndVerify(page, item, stateLabel) {
  await page.goto(BASE, { waitUntil: "networkidle0" });
  await page.waitForSelector("#message");
  await page.click("#message");
  await page.type("#message", item.text, { delay: 4 });

  const picked = await page.evaluate((label) => {
    const labels = [...document.querySelectorAll("label.state-chip")];
    const target = labels.find((node) => node.textContent?.includes(label));
    if (!target) return false;
    target.click();
    return true;
  }, stateLabel);
  if (!picked) throw new Error(`状态选项「${stateLabel}」未找到`);

  const submitDisabled = await page.$eval("button[type=submit]", (el) => el.disabled);
  if (submitDisabled) throw new Error("开始核验按钮仍为 disabled，页面 hydration 可能失败");

  await page.click("button[type=submit]");
  await page.waitForFunction(() => document.body.innerText.includes("脱敏确认"), {
    timeout: 30000,
  });
  await sleep(400);
  await scrollToText(page, "脱敏确认");

  await clickByText(page, "button", "确认并核验");
  await page.waitForFunction(
    () =>
      document.body.innerText.includes("核验结论") ||
      document.body.innerText.includes("核验未完成"),
    { timeout: 120000 },
  );
  await sleep(900);
  await scrollToText(page, "核验结论");

  return page.evaluate(() => {
    const text = document.body.innerText;
    const section = (keyword) =>
      [...document.querySelectorAll("section")].find((node) => node.innerText.includes(keyword)) ??
      null;
    return {
      verdict:
        [
          "未见异常（信息不足，请通过官方渠道再次核实）",
          "存疑，需人工核实",
          "高危",
          "可疑",
        ].find((label) => text.includes(label)) ?? null,
      hasAnatomy: Boolean(section("套路结构")),
      hasForesight: Boolean(section("下一步通常会发生什么")),
      hasCard: Boolean(section("可转发给长辈的提醒卡")),
      hasActions: Boolean(section("现在该做什么")),
      evidenceCount:
        Number(
          (text.match(/证据列表 · (\\d+) 条/) || text.match(/证据列表 · (\\d+)/) || [])[1] ?? 0,
        ) || null,
    };
  });
}

async function shotElement(page, keyword, path) {
  const handle = await page.evaluateHandle((kw) => {
    const sections = [...document.querySelectorAll("section")];
    return sections.find((node) => node.innerText.includes(kw)) ?? null;
  }, keyword);
  const element = handle.asElement();
  if (!element) return false;
  await element.screenshot({ path });
  return true;
}

async function main() {
  if (!existsSync(EDGE)) throw new Error("未找到 Edge，可改用 Chrome 路径");
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none"],
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  const log = {};

  // 桌面：首页 + 脱敏确认
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(BASE, { waitUntil: "networkidle0" });
  await sleep(700);
  await page.screenshot({ path: join(OUT, "01-home-desktop.png") });

  // 桌面：高危案例全链路
  const highMeta = await fillAndVerify(page, CASES[0], CASES[0].stateLabel);
  await page.screenshot({ path: join(OUT, "02-result-high-desktop.png") });
  await shotElement(page, "套路结构", join(OUT, "03-anatomy-desktop.png"));
  await shotElement(page, "可转发给长辈的提醒卡", join(OUT, "04-card-desktop.png"));
  await shotElement(page, "现在该做什么", join(OUT, "05-actions-desktop.png"));

  await clickByText(page, "button", "检索留痕");
  await sleep(500);
  await shotElement(page, "检索留痕", join(OUT, "06-trace-desktop.png"));
  log.high = highMeta;

  // 桌面：脱敏确认页单独截一张
  await page.goto(BASE, { waitUntil: "networkidle0" });
  await page.click("#message");
  await page.type("#message", CASES[0].text, { delay: 4 });
  await page.click("button[type=submit]");
  await page.waitForFunction(() => document.body.innerText.includes("脱敏确认"));
  await sleep(400);
  await scrollToText(page, "脱敏确认");
  await page.screenshot({ path: join(OUT, "07-sanitize-desktop.png") });

  // 桌面：正常通知与查无实据
  log.normal = await fillAndVerify(page, CASES[1], CASES[1].stateLabel);
  await page.screenshot({ path: join(OUT, "08-result-normal-desktop.png") });

  log.unknown = await fillAndVerify(page, CASES[2], CASES[2].stateLabel);
  await page.screenshot({ path: join(OUT, "09-result-unknown-desktop.png") });

  // 手机竖版：首页 + 高危结果 + 卡片
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(BASE, { waitUntil: "networkidle0" });
  await sleep(700);
  await page.screenshot({ path: join(OUT, "10-home-mobile.png") });

  log.highMobile = await fillAndVerify(page, CASES[0], CASES[0].stateLabel);
  await page.screenshot({ path: join(OUT, "11-result-high-mobile.png") });
  await shotElement(page, "可转发给长辈的提醒卡", join(OUT, "12-card-mobile.png"));

  // 分享页（把卡片链接复制出来，直接打开验证）
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(BASE, { waitUntil: "networkidle0" });
  await page.click("#message");
  await page.type("#message", CASES[0].text, { delay: 4 });
  await page.click("button[type=submit]");
  await page.waitForFunction(() => document.body.innerText.includes("脱敏确认"));
  await clickByText(page, "button", "确认并核验");
  await page.waitForFunction(() => document.body.innerText.includes("核验结论"), {
    timeout: 120000,
  });
  await sleep(800);
  const shareUrl = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")];
    const btn = buttons.find((b) => b.textContent?.includes("复制转发链接"));
    if (!btn) return null;
    return new Promise((resolve) => {
      const original = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = async (value) => {
        resolve(value);
        return original(value);
      };
      btn.click();
      setTimeout(() => resolve(null), 3000);
    });
  });
  if (shareUrl) {
    await page.goto(shareUrl, { waitUntil: "networkidle0" });
    await sleep(700);
    await page.screenshot({ path: join(OUT, "13-share-page-mobile.png") });
    log.shareUrlLength = shareUrl.length;
  }

  writeFileSync(join(OUT, "run-log.json"), JSON.stringify(log, null, 2), "utf8");
  await browser.close();

  console.log(JSON.stringify(log, null, 2));
  console.log(`截图已输出到 ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
