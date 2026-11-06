"use client";

import React, { useEffect, useRef, useState } from "react";
import { FamilyCard } from "@/components/FamilyCard";
import type {
  Claim,
  ClaimVerdict,
  Evidence,
  FamilyState,
  VerificationResult,
} from "@/lib/types";
import { STATE_LABEL } from "@/lib/brief/materials";
import { exportCardImage } from "@/lib/export-card";
import { ACTION_LABEL } from "@/lib/explain/anatomy";
import { formatDate } from "@/lib/format";
import { OVERALL_LABEL } from "@/lib/verdict/adjudicate";

const INITIAL_TEXT = `粘贴可疑消息、短信或聊天记录。例如：
“您好，我是中通客服，您的包裹破损，可三倍理赔，请下载指定软件……”`;

const DEFAULT_STATE: FamilyState = "message_only";

const ANATOMY_LABEL: Record<string, string> = {
  hook: "钩子",
  threat: "施压",
  isolation: "孤立",
  demand: "索要",
};

const ANATOMY_NOTE: Record<string, string> = {
  hook: "给一个必须回应的理由",
  threat: "制造恐惧或利益诱惑",
  isolation: "阻断求助与核实",
  demand: "让你交出钱、码或权限",
};

const LEVEL_STYLE: Record<number, { label: string; border: string; text: string }> = {
  1: { label: "官方", border: "#3d5852", text: "#3d5852" },
  2: { label: "央媒", border: "#4a6b7c", text: "#4a6b7c" },
  3: { label: "机构", border: "#856015", text: "#856015" },
  4: { label: "自媒体", border: "#a89f92", text: "#857c70" },
};

export default function HomePage() {
  const [text, setText] = useState("");
  const [state, setState] = useState<FamilyState>(DEFAULT_STATE);
  const [preview, setPreview] = useState<{
    sanitizedText: string;
    redactions: { placeholder: string; kind: string }[];
  } | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTrace, setShowTrace] = useState(false);

  async function requestPreview(e: React.FormEvent) {
    e.preventDefault();
    if (text.trim().length === 0) {
      setError("请粘贴需要核验的消息内容");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setPreview(null);

    try {
      const res = await fetch("/api/sanitize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json()) as {
        sanitizedText?: string;
        redactions?: { placeholder: string; kind: string }[];
        failure?: string;
      };
      if (!res.ok || !data.sanitizedText) {
        setError(data.failure ?? "请求失败");
        return;
      }
      setPreview({ sanitizedText: data.sanitizedText, redactions: data.redactions ?? [] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setLoading(false);
    }
  }

  async function confirmAndVerify() {
    if (!preview) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: preview.sanitizedText, familyState: state }),
      });
      const data = (await res.json()) as VerificationResult & { failure?: string };
      if (!res.ok) {
        setError(data.failure ?? "请求失败");
        return;
      }
      setResult(data);
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen px-5 pb-16 pt-8 sm:px-6 sm:pt-12 md:pt-16">
      <div className="page-frame mx-auto w-full max-w-[880px]">
        <header className="rise">
          <div className="flex items-center gap-3">
            <span className="h-px w-9" style={{ background: "var(--line-strong)" }} />
            <span className="eyebrow">反诈鉴谎师</span>
          </div>

          <h1 className="display mt-4 max-w-[18ch] text-balance">
            先别转账，
            <br />
            我们把这条消息查清楚。
          </h1>

          <p className="lede mt-5 max-w-[54ch]">
            家人已经在跟对方通话时，讲道理往往没用。把那段话术贴进来，
            我们一起找出可核验的依据，再做一张能说服他的卡。
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
            {["元宝搜索实时信源", "本地脱敏", "四态裁决", "可转发提醒卡"].map((item, index) => (
              <span key={item} className="metric flex items-center gap-2">
                {index > 0 && (
                  <span
                    className="inline-block h-1 w-1 rounded-full"
                    style={{ background: "var(--line-strong)" }}
                  />
                )}
                {item}
              </span>
            ))}
          </div>
        </header>

        <form onSubmit={requestPreview} className="panel rise rise-1 mt-7 space-y-6 p-5 sm:mt-9 sm:p-7">
          <div>
            <div className="mb-2.5 flex items-baseline justify-between gap-4">
              <label htmlFor="message" className="text-sm font-medium text-[#221f1c]">
                可疑消息原文
              </label>
              <span className="metric">
                {text.length} / 5000
              </span>
            </div>
            <textarea
              id="message"
              name="message"
              autoComplete="off"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={INITIAL_TEXT}
              disabled={loading}
              className="field h-36 resize-y sm:h-40"
            />
          </div>

          <div>
            <p className="mb-2.5 text-sm font-medium text-[#221f1c]">家人现在走到哪一步了</p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {(Object.keys(STATE_LABEL) as FamilyState[]).map((s) => (
                <label
                  key={s}
                  className={`state-chip ${state === s ? "is-active" : ""}`}
                >
                  <span className="state-dot" aria-hidden="true" />
                  <span>
                    <span className="block font-medium">{STATE_LABEL[s]}</span>
                    <span className="mt-0.5 block text-xs opacity-70">
                      {stateHint(s)}
                    </span>
                  </span>
                  <input
                    type="radio"
                    name="state"
                    value={s}
                    checked={state === s}
                    onChange={() => setState(s)}
                    disabled={loading}
                    className="sr-only"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="metric leading-relaxed">
              只有脱敏后的文本会被发送到检索服务
            </p>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full sm:w-auto sm:min-w-[172px]"
            >
              {loading ? "核验中…" : "开始核验"}
            </button>
          </div>

          {error && (
            <div
              className="rounded-[10px] border px-3.5 py-2.5 text-sm"
              style={{ borderColor: "#e9c3b6", background: "#f7e2da", color: "#a33a21" }}
              role="alert"
            >
              {error}
            </div>
          )}
        </form>

        {preview && (
          <section className="panel rise mt-5 p-5 sm:p-7">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="serif text-lg font-semibold">脱敏确认</h2>
              <span className="metric">发送前最后一步</span>
            </div>
            <p className="lede mt-2 text-sm">
              下面是即将外发的内容。号码、证件、地址已替换为占位符，确认后才会开始检索。
            </p>

            <div
              className="mt-4 rounded-[10px] border-l-2 bg-[#f9f5ec] px-4 py-3.5 text-[0.95rem] leading-[1.85] whitespace-pre-wrap"
              style={{ borderLeftColor: "var(--accent)" }}
            >
              {preview.sanitizedText}
            </div>

            {preview.redactions.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="metric">已脱敏</span>
                {preview.redactions.map((r) => (
                  <span
                    key={r.placeholder}
                    className="mono rounded border px-1.5 py-0.5 text-[11px]"
                    style={{
                      borderColor: "var(--line)",
                      color: "var(--ink-soft)",
                      background: "var(--surface-2)",
                    }}
                  >
                    {r.placeholder}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
              <button
                type="button"
                onClick={confirmAndVerify}
                disabled={loading}
                className="btn btn-primary flex-1"
              >
                {loading ? "核验中…" : "确认并核验"}
              </button>
              <button
                type="button"
                onClick={() => setPreview(null)}
                disabled={loading}
                className="btn btn-ghost sm:w-auto"
              >
                返回修改
              </button>
            </div>
          </section>
        )}

        {result && !error && (
          <ResultView
            result={result}
            showTrace={showTrace}
            onToggleTrace={() => setShowTrace(!showTrace)}
          />
        )}

        <footer className="mt-12 border-t pt-6 text-center" style={{ borderColor: "var(--line)" }}>
          <p className="metric leading-relaxed">
            信息核验仅供参考，不构成法律意见或安全承诺
          </p>
          <p className="metric mt-1.5 leading-relaxed">
            高危情况请立即拨打 <strong className="font-semibold">96110</strong> 或{" "}
            <strong className="font-semibold">110</strong>
          </p>
          <p className="metric mt-4 opacity-70">
            基于腾讯云元宝搜索 · 【元宝搜索开发者征文大赛】参赛作品
          </p>
        </footer>
      </div>
    </main>
  );
}

function stateHint(state: FamilyState): string {
  switch (state) {
    case "message_only":
      return "还没做任何操作，先劝阻";
    case "joined_group":
      return "已加群或填过信息，需要清理";
    case "remote_access":
      return "已开屏幕共享，情况紧急";
    case "transferred":
      return "已经转出，需要立即止损";
  }
}

function ResultView({
  result,
  showTrace,
  onToggleTrace,
}: {
  result: VerificationResult;
  showTrace: boolean;
  onToggleTrace: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [savingImage, setSavingImage] = useState(false);
  const [shareTip, setShareTip] = useState("");

  useEffect(() => {
    if (!result.verdict) return;
    try {
      localStorage.setItem(
        "afp:last-trace",
        JSON.stringify({
          savedAt: new Date().toISOString(),
          overall: result.verdict.overall,
          trace: result.trace,
        }),
      );
    } catch {
      // 隐私模式下写入失败不影响主流程
    }
  }, [result]);

  if (result.failure) {
    return (
      <section
        className="panel rise mt-5 p-5 sm:p-7"
        style={{ borderColor: "#e9c3b6", background: "#fdf4f0" }}
      >
        <h2 className="serif text-lg font-semibold" style={{ color: "#a33a21" }}>
          核验未完成
        </h2>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "#7d4a37" }}>
          {result.failure}
        </p>
      </section>
    );
  }

  const { verdict, anatomy, foresight, brief, plan } = result;
  if (!verdict) return null;

  // 只有确认存在可疑行为时才展示"下一步"统计，避免正常通知被套上诈骗叙事
  const showForesight =
    foresight !== null && (verdict.overall === "high" || verdict.overall === "suspicious");
  const showConfidence = verdict.overall === "high" || verdict.overall === "suspicious";

  async function saveImage() {
    if (!cardRef.current) return;
    setSavingImage(true);
    try {
      const dataUrl = await exportCardImage(cardRef.current);
      const link = document.createElement("a");
      link.download = `提醒卡-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
      setShareTip("长图已保存到下载目录");
    } catch {
      setShareTip("生成图片失败，可以直接截屏");
    } finally {
      setSavingImage(false);
    }
  }

  async function copyLink() {
    if (!brief) return;
    try {
      const shareable: typeof brief = {
        ...brief,
        evidence: brief.evidence.map(({ title, site, publishedAt }) => ({
          title,
          site,
          publishedAt,
        })),
      };
      const payload = btoa(encodeURIComponent(JSON.stringify(shareable)));
      const url = `${window.location.origin}/card?d=${encodeURIComponent(payload)}`;
      await navigator.clipboard.writeText(url);
      setShareTip("转发链接已复制，可以直接发到家庭群");
    } catch {
      setShareTip("复制失败，请手动复制地址栏链接");
    }
  }

  function exportTrace() {
    const current = result.verdict;
    if (!current) return;
    const payload = {
      overall: current.overall,
      confidence: current.confidence,
      confidenceBasis: current.confidenceBasis,
      claims: result.claims,
      claimVerdicts: current.claims,
      trace: result.trace,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `核验留痕-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <div className="mt-5 space-y-4 sm:space-y-5">
      <section className="panel rise p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="eyebrow">核验结论</span>
            <h2 className="serif mt-2.5 text-2xl sm:text-[1.75rem] leading-snug">
              {OVERALL_LABEL[verdict.overall]}
            </h2>
            <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-[#57514a]">
              {showConfidence
                ? verdict.confidenceBasis
                : "未找到与该消息直接对应的诈骗通报。检索范围有限，仍请通过官方渠道核实。"}
            </p>
          </div>
          {showConfidence && (
            <span
              className={`pill ${
                verdict.overall === "high"
                  ? "pill-high"
                  : verdict.overall === "suspicious"
                    ? "pill-warn"
                    : "pill-calm"
              }`}
            >
              置信度
              {verdict.confidence === "high"
                ? "高"
                : verdict.confidence === "medium"
                  ? "中"
                  : "低"}
            </span>
          )}
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3 border-t pt-5" style={{ borderColor: "var(--line)" }}>
          <Stat label="断言" value={result.claims.length} />
          <Stat label="证据" value={result.evidence.length} />
          <Stat label="检索" value={result.trace.totalQueries} />
        </div>
      </section>

      {anatomy && (
        <section className="panel rise p-5 sm:p-7">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="serif text-lg font-semibold">套路结构</h2>
            <span className="metric">四段话术拆解</span>
          </div>

          <ol className="mt-5 space-y-4">
            {anatomy.map((row, index) => (
              <li key={row.segment} className="flex gap-3.5">
                <span
                  className="mt-0.5 inline-flex h-8 w-8 flex-none items-center justify-center rounded-full border font-mono text-[11px]"
                  style={
                    row.hit
                      ? { borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--accent-deep)" }
                      : { borderColor: "var(--line-strong)", background: "#fffefb", color: "var(--ink-mute)" }
                  }
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {ANATOMY_LABEL[row.segment]}
                    <span className="ml-2 text-xs font-normal text-[#857c70]">
                      {ANATOMY_NOTE[row.segment]}
                    </span>
                  </p>
                  <p
                    className={`mt-1 text-sm leading-relaxed ${
                      row.hit ? "text-[#221f1c]" : "text-[#a89f92]"
                    }`}
                  >
                    {row.hit ? row.excerpt : "未见"}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {showForesight && foresight && (
        <section className="panel rise p-5 sm:p-7">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="serif text-lg font-semibold">下一步通常会发生什么</h2>
            <span className="metric">同类案例 {foresight.totalCases} 例</span>
          </div>

          <div className="mt-5 space-y-3.5">
            {foresight.items.map((item) => {
              const percent = Math.round((item.count / foresight.totalCases) * 100);
              return (
                <div key={item.action}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-[#221f1c]">{ACTION_LABEL[item.action]}</span>
                    <span className="metric">
                      {item.count}/{foresight.totalCases}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3">
                    <div className="bar-track flex-1">
                      <div className="bar-fill" style={{ width: `${percent}%` }} />
                    </div>
                    <span className="mono text-[11px] text-[#857c70]">{percent}%</span>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="metric mt-4 leading-relaxed">
            统计自可检索到的同类案例，不是对当前对话的预测
          </p>
        </section>
      )}

      {brief && (
        <section className="panel rise overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5 sm:px-7 sm:pt-7">
            <h2 className="serif text-lg font-semibold">可转发给长辈的提醒卡</h2>
            <span className="metric">750px 版式 · 正文 ≥18px</span>
          </div>

          <div className="card-stage mt-4 overflow-x-auto px-4 py-5 sm:px-6">
            <FamilyCard ref={cardRef} brief={brief} />
          </div>

          <div className="flex flex-col gap-2.5 px-5 pb-5 sm:flex-row sm:px-7 sm:pb-7">
            <button
              type="button"
              onClick={saveImage}
              disabled={savingImage}
              className="btn btn-primary flex-1"
            >
              {savingImage ? "正在生成…" : "保存长图"}
            </button>
            <button type="button" onClick={copyLink} className="btn btn-soft flex-1">
              复制转发链接
            </button>
          </div>

          {shareTip && (
            <p className="px-5 pb-5 text-sm sm:px-7" style={{ color: "var(--accent-deep)" }}>
              {shareTip}
            </p>
          )}
        </section>
      )}

      <section className="panel rise p-5 sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="serif text-lg font-semibold">现在该做什么</h2>
          <span className="metric">{STATE_LABEL[plan.state]}</span>
        </div>

        <ol className="mt-5 space-y-3">
          {plan.items.map((item, index) => (
            <li key={item.order} className="flex gap-3.5">
              <span
                className="mt-0.5 inline-flex h-7 w-7 flex-none items-center justify-center rounded-full font-mono text-[11px]"
                style={{ background: "var(--surface-2)", color: "var(--ink-soft)", border: "1px solid var(--line)" }}
              >
                {index + 1}
              </span>
              <p className="text-[0.95rem] leading-relaxed text-[#221f1c]">{item.text}</p>
            </li>
          ))}
        </ol>

        {plan.emergency && (
          <div
            className="mt-5 rounded-[10px] border px-4 py-3 text-sm"
            style={{ borderColor: "#e9c3b6", background: "#f7e2da", color: "#a33a21" }}
          >
            情况紧急，请立即拨打 <strong>96110</strong> 或 <strong>110</strong>。
          </div>
        )}

        <p className="metric mt-4 leading-relaxed">{plan.disclaimer}</p>
      </section>

      <section className="panel rise px-5 py-2 sm:px-7">
        <button type="button" onClick={onToggleTrace} className="disclosure" aria-expanded={showTrace}>
          <span>检索留痕 · 演示与复核</span>
          <span className="metric">{showTrace ? "收起" : "展开"}</span>
        </button>

        {showTrace && (
          <div className="space-y-4 pb-5">
            <div className="flex flex-wrap items-center gap-4">
              <span className="metric">总耗时 {result.trace.totalDurationMs}ms</span>
              <span className="metric">检索 {result.trace.totalQueries} 次</span>
              <button type="button" onClick={exportTrace} className="btn btn-ghost ml-auto px-3 py-1.5 text-xs">
                导出留痕
              </button>
            </div>

            <div className="space-y-1.5">
              {result.trace.queries.map((q, i) => (
                <div
                  key={`${q.query}-${i}`}
                  className="mono flex flex-wrap items-baseline gap-x-2 rounded border-l-2 px-2.5 py-1.5 text-[11px] leading-relaxed"
                  style={{
                    borderLeftColor: q.status === "ok" ? "#3d5852" : "#a33a21",
                    background: q.status === "ok" ? "#f4f7f4" : "#fbf1ed",
                    color: q.status === "ok" ? "#3f4f48" : "#8a4a33",
                  }}
                >
                  <span>{q.status === "ok" ? `${q.resultCount} 条 · ${q.durationMs}ms` : q.status}</span>
                  <span className="opacity-60">|</span>
                  <span className="break-all">{q.query}</span>
                </div>
              ))}
            </div>

            <p className="metric">本次记录已保存到本机，仅用于复核与演示取证</p>

            <ExpandableClaims claims={result.claims} verdict={result.verdict?.claims} />
            <ExpandableEvidence evidence={result.evidence} />
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="mono text-xl font-medium leading-none text-[#221f1c]">{value}</p>
      <p className="metric mt-1.5">{label}</p>
    </div>
  );
}

function ExpandableClaims({
  claims,
  verdict,
}: {
  claims: Claim[];
  verdict?: ClaimVerdict[];
}) {
  const [open, setOpen] = useState(false);
  if (!claims || claims.length === 0) return null;

  return (
    <div className="border-t pt-3" style={{ borderColor: "var(--line)" }}>
      <button type="button" onClick={() => setOpen(!open)} className="disclosure" aria-expanded={open}>
        <span>断言拆解 · {claims.length} 条</span>
        <span className="metric">{open ? "收起" : "展开"}</span>
      </button>

      {open && (
        <div className="space-y-2 pb-2">
          {claims.map((claim) => {
            const v = verdict?.find((item) => item.claimId === claim.id);
            return (
              <div key={claim.id} className="rounded bg-[#f9f5ec] px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm leading-relaxed text-[#221f1c]">{claim.excerpt}</span>
                  {v && (
                    <span className="metric whitespace-nowrap">
                      {v.state === "official_confirmed"
                        ? "官方确证"
                        : v.state === "highly_suspicious"
                          ? "高度可疑"
                          : v.state === "conflicting"
                            ? "证据冲突"
                            : "无法判断"}
                    </span>
                  )}
                </div>
                {v && (
                  <p className="mt-1 text-xs leading-relaxed text-[#857c70]">{v.reason}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ExpandableEvidence({ evidence }: { evidence: Evidence[] }) {
  const [open, setOpen] = useState(false);
  if (!evidence || evidence.length === 0) return null;

  return (
    <div className="border-t pt-3" style={{ borderColor: "var(--line)" }}>
      <button type="button" onClick={() => setOpen(!open)} className="disclosure" aria-expanded={open}>
        <span>证据列表 · {evidence.length} 条</span>
        <span className="metric">{open ? "收起" : "展开"}</span>
      </button>

      {open && (
        <div className="max-h-72 space-y-1.5 overflow-y-auto pb-2 pr-1">
          {evidence.map((e) => {
            const style = LEVEL_STYLE[e.level] ?? LEVEL_STYLE[4];
            return (
              <a
                key={e.id}
                href={e.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded border-l-2 px-2.5 py-2 transition-colors hover:bg-[#f9f5ec]"
                style={{ borderLeftColor: style.border, background: "#fffefb" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="text-xs font-medium leading-relaxed text-[#221f1c]">{e.title}</span>
                  <span className="mono whitespace-nowrap text-[10px]" style={{ color: style.text }}>
                    {style.label} · {e.site}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-1 text-[11px] leading-relaxed text-[#857c70]">
                  {formatDate(e.publishedAt) || "日期未知"}
                  {e.isOldCase ? " · 较早案例" : ""}
                  {e.mergedFrom > 0 ? ` · 合并 ${e.mergedFrom} 个转载` : ""}
                </p>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
