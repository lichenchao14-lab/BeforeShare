/**
 * 为征文 2.3 对比表补实测数据：同一个问题，直接问 hy3，看它能不能给出可核验的来源。
 * 只读 .env.local 里的密钥，不改任何应用代码。
 */
import { readFileSync, writeFileSync } from "node:fs";

const raw = readFileSync(".env.local", "utf8");
for (const line of raw.split(/\r?\n/)) {
  if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
  const index = line.indexOf("=");
  const key = line.slice(0, index).trim();
  const value = line.slice(index + 1).trim();
  if (!process.env[key]) process.env[key] = value;
}

const SAMPLE =
  "您好，我是中通快递客服，您的包裹在运输中破损，我们可以为您办理三倍理赔。请添加理赔专员微信，下载会议软件并开启屏幕共享，按指引填写银行卡号和短信验证码完成退款。";

interface Case {
  id: string;
  label: string;
  user: string;
  repeat: number;
}

const CASES: Case[] = [
  {
    id: "plain",
    label: "A 普通问法：这条是不是诈骗",
    user: `帮我看看这条消息是不是诈骗：\n\n${SAMPLE}`,
    repeat: 1,
  },
  {
    id: "sources",
    label: "B 追问依据：要通报名、单位、日期、链接",
    user: `这条消息是不是诈骗？请给出官方通报作为依据，带上通报名称、发布单位、发布日期和链接。\n\n${SAMPLE}`,
    repeat: 2,
  },
  {
    id: "fresh",
    label: "C 时效题：最近一周有哪些快递理赔诈骗通报",
    user: "2026 年 10 月下旬，最近一周内有哪些关于快递理赔诈骗的警方通报？请给出具体通报名称、发布单位和发布日期。",
    repeat: 1,
  },
];

function envIdFromBaseUrl(baseUrl: string | undefined): string {
  if (!baseUrl) return "";
  try {
    return new URL(baseUrl).hostname.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

async function askHy3(user: string): Promise<{ text: string; ms: number }> {
  const tcb = (await import("@cloudbase/node-sdk")).default;
  const envId = process.env.LLM_ENV_ID || envIdFromBaseUrl(process.env.LLM_BASE_URL);
  const app = tcb.init({
    env: envId,
    accessKey: process.env.LLM_API_KEY as string,
    timeout: 60000,
  });
  const ai = (app as unknown as { ai: () => { createModel: (name: string) => unknown } }).ai();
  const chatModel = ai.createModel("cloudbase") as {
    generateText: (options: {
      model: string;
      messages: { role: string; content: string }[];
    }) => Promise<{ text?: string }>;
  };
  const started = Date.now();
  const res = await chatModel.generateText({
    model: process.env.LLM_MODEL || "hy3",
    messages: [{ role: "user", content: user }],
  });
  return { text: (res.text ?? "").trim(), ms: Date.now() - started };
}

function stripPunct(s: string): string {
  return s.replace(/[\s：:，,。、“”"'！!？?—\-–·|《》()（）]/g, "");
}

function measure(text: string) {
  const urls = Array.from(new Set(text.match(/https?:\/\/[^\s)\]）>"'\]]+/g) ?? []));
  const titles = Array.from(new Set(text.match(/《[^》]{4,80}》/g) ?? []));
  const dates = text.match(/20\d{2}\s*[年\-\/.]\s*\d{1,2}\s*[月\-\/.]\s*\d{1,2}\s*日?/g) ?? [];
  const docNumbers = text.match(/[〔[（(]\s*20\d{2}\s*[〕\]）)]\s*\d+\s*号/g) ?? [];
  const admitsCutoff =
    /知识(?:截止|库截止)|训练数据截止|无法(?:获取|访问)实时|不能联网|没有联网|无法查询最新/.test(text);
  return { chars: text.length, urls, titles, dates, docNumbers, admitsCutoff };
}

async function checkUrl(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    return `HTTP ${res.status}`;
  } catch (error) {
    return `不可访问（${error instanceof Error ? error.message : "未知错误"}）`;
  } finally {
    clearTimeout(timer);
  }
}

async function checkTitleViaWsa(title: string) {
  const { searchWsa } = await import("../src/lib/retrieve/wsa");
  const bare = stripPunct(title.replace(/^《|》$/g, ""));
  const results = await searchWsa(title.replace(/^《|》$/g, ""), {
    timeoutMs: 8000,
    tuning: { cnt: 10 },
  });
  const hit = results.find((r) => {
    const rt = stripPunct(r.title);
    const probe = bare.slice(0, Math.min(16, bare.length));
    return rt.includes(probe) || bare.includes(stripPunct(r.title).slice(0, 16));
  });
  return {
    found: Boolean(hit),
    total: results.length,
    hit: hit ? `${hit.date ?? "无日期"} | ${hit.site} | ${hit.title}` : null,
    top: results.slice(0, 3).map((r) => `${r.date ?? "无日期"} | ${r.site} | ${r.title}`),
  };
}

async function main() {
  const report: Record<string, unknown>[] = [];

  for (const testCase of CASES) {
    for (let run = 1; run <= testCase.repeat; run += 1) {
      const tag = `${testCase.id}#${run}`;
      let text = "";
      let ms = 0;
      try {
        const out = await askHy3(testCase.user);
        text = out.text;
        ms = out.ms;
      } catch (error) {
        console.log(`${tag} 调用失败：${error instanceof Error ? error.message : error}`);
        continue;
      }

      const stats = measure(text);
      console.log(`\n=== ${tag} ${testCase.label} ===`);
      console.log(
        `耗时 ${ms}ms | 输出 ${stats.chars} 字 | 链接 ${stats.urls.length} | 《》标题 ${stats.titles.length} | 日期 ${stats.dates.length} | 文号 ${stats.docNumbers.length} | 自认无法联网 ${stats.admitsCutoff}`,
      );
      console.log("--- 回答全文 ---");
      console.log(text);

      const urlChecks: { url: string; status: string }[] = [];
      for (const url of stats.urls.slice(0, 6)) {
        urlChecks.push({ url, status: await checkUrl(url) });
      }

      const titleChecks: {
        title: string;
        found: boolean;
        total: number;
        hit: string | null;
        top: string[];
      }[] = [];
      for (const title of stats.titles.slice(0, 8)) {
        const result = await checkTitleViaWsa(title);
        titleChecks.push({ title, ...result });
      }

      if (urlChecks.length > 0) {
        console.log("--- 链接核验 ---");
        for (const item of urlChecks) console.log(`${item.status} | ${item.url}`);
      }
      if (titleChecks.length > 0) {
        console.log("--- 引用的通报能否用元宝搜索查到 ---");
        for (const item of titleChecks) {
          console.log(
            `${item.found ? "可检索到" : "查无此文"} | ${item.title}${item.hit ? ` → ${item.hit}` : ""}`,
          );
          if (!item.found) {
            for (const top of item.top) console.log(`    实际返回：${top}`);
          }
        }
      }

      report.push({ tag, label: testCase.label, ms, ...stats, urlChecks, titleChecks, text });
    }
  }

  writeFileSync(
    "C:/Users/Administrator/AppData/Local/Temp/hy3-compare-result.json",
    JSON.stringify(report, null, 2),
    "utf8",
  );
  console.log("\nJSON 已写入临时文件 hy3-compare-result.json");
}

main().catch((error) => {
  console.error("PROBE_FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
