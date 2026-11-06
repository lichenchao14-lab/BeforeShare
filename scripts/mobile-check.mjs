/**
 * 10.2 三档手机宽度实测：
 * 1) 分享页是否出现横向滚动
 * 2) 卡片是否超出视口、文字是否被裁切
 * 3) 导出的长图宽度是否稳定为 1500px（750 × 2）
 * 用法：node scripts/mobile-check.mjs
 */
import puppeteer from "puppeteer-core";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = "http://localhost:3000";
const OUT = join(process.cwd(), "screenshots");
const DL = join(process.cwd(), ".spike", "downloads");

const WIDTHS = [
  { name: "360", width: 360, height: 780 },
  { name: "390", width: 390, height: 844 },
  { name: "430", width: 430, height: 932 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pngSize(path) {
  const buf = readFileSync(path);
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function waitForDownload(dir, before, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const files = readdirSync(dir).filter((f) => f.endsWith(".png") && !before.includes(f));
    if (files.length > 0) {
      const path = join(dir, files[0]);
      // 等文件写完
      await sleep(400);
      return path;
    }
    await sleep(300);
  }
  return null;
}

async function main() {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  if (!existsSync(DL)) mkdirSync(DL, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu"],
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(`pageerror: ${error.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") pageErrors.push(`console: ${msg.text()}`);
  });
  const client = await page.createCDPSession();
  await client.send("Page.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: DL,
  });

  // 1. 在 390 宽度下跑一次核验，拿到分享链接
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(BASE, { waitUntil: "networkidle0" });
  await page.click("#message");
  await page.type(
    "#message",
    "您好，我是中通快递客服，您的包裹在运输中破损，我们可以为您办理三倍理赔。请添加理赔专员微信，下载会议软件并开启屏幕共享，按指引填写银行卡号和短信验证码完成退款。",
    { delay: 3 },
  );
  await page.evaluate(() => {
    const label = [...document.querySelectorAll("label.state-chip")].find((n) =>
      n.textContent?.includes("已安装远程应用或开启屏幕共享"),
    );
    label?.click();
  });
  await page.click("button[type=submit]");
  await page.waitForFunction(() => document.body.innerText.includes("脱敏确认"));
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("确认并核验"),
    );
    btn?.click();
  });
  await page.waitForFunction(() => document.body.innerText.includes("核验结论"), {
    timeout: 120000,
  });
  await sleep(800);

  const shareUrl = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("复制转发链接"),
    );
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
  if (!shareUrl) throw new Error("未能取得分享链接");

  // 2. 三档宽度逐一检查
  const results = [];
  for (const device of WIDTHS) {
    await page.setViewport({
      width: device.width,
      height: device.height,
      deviceScaleFactor: 2,
    });
    await page.goto(shareUrl, { waitUntil: "networkidle0" });
    await sleep(700);

    const metrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const card = document.querySelector("div[style*='750px']");
      const clipped = [];
      if (card) {
        for (const el of card.querySelectorAll("p,span,div")) {
          if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
            clipped.push((el.textContent ?? "").slice(0, 24));
          }
        }
      }
      const cardBox = card?.getBoundingClientRect();
      const conclusion = card?.querySelector("p");
      const conclusionBox = conclusion?.getBoundingClientRect();
      return {
        innerWidth: window.innerWidth,
        scrollWidth: doc.scrollWidth,
        overflowX: doc.scrollWidth - window.innerWidth,
        cardWidth: cardBox ? Math.round(cardBox.width) : null,
        cardLeft: cardBox ? Math.round(cardBox.left) : null,
        cardRight: cardBox ? Math.round(cardBox.right) : null,
        conclusionVisible:
          conclusionBox !== undefined
            ? conclusionBox.top < window.innerHeight && conclusionBox.bottom > 0
            : null,
        conclusionFontSize: conclusion
          ? getComputedStyle(conclusion).fontSize
          : null,
        clippedTexts: clipped.slice(0, 5),
      };
    });

    await page.screenshot({ path: join(OUT, `mobile-${device.name}.png`) });

    // 清掉旧文件，避免同名下载被浏览器改名或被误认为已完成
    for (const f of readdirSync(DL)) {
      if (f.endsWith(".png")) rmSync(join(DL, f));
    }
    const before = [];
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("保存长图"),
      );
      btn?.click();
    });
    const file = await waitForDownload(DL, before);
    const size = file ? pngSize(file) : null;

    results.push({
      device: device.name,
      ...metrics,
      exportedPng: size,
      downloadedFile: file ? file.split("\\").pop() : null,
    });
  }

  await browser.close();

  const widths = results.map((r) => r.exportedPng?.width).filter(Boolean);
  const heights = results.map((r) => r.exportedPng?.height).filter(Boolean);
  const pass =
    results.every((r) => r.overflowX <= 1 && (r.cardWidth ?? 0) <= r.innerWidth) &&
    widths.length === 3 &&
    new Set(widths).size === 1 &&
    new Set(heights).size === 1;

  const report = { pass, shareUrlLength: shareUrl.length, pageErrors, results };
  writeFileSync(join(OUT, "mobile-check.json"), JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify(report, null, 2));
  console.log(pass ? "\n结论：三档宽度均无横向溢出，导出长图尺寸一致" : "\n结论：存在不符合项，见上");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
