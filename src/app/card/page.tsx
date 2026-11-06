"use client";

import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import { FamilyCard } from "@/components/FamilyCard";
import { exportCardImage } from "@/lib/export-card";
import type { FamilyBrief } from "@/lib/types";

function decodeBrief(raw: string | null): FamilyBrief | null {
  if (!raw) return null;
  try {
    const json = decodeURIComponent(atob(decodeURIComponent(raw)));
    const parsed = JSON.parse(json) as FamilyBrief;
    if (!parsed.conclusion) return null;
    return parsed;
  } catch {
    return null;
  }
}

export default function CardPage() {
  const [brief, setBrief] = useState<FamilyBrief | null>(null);
  const [missing, setMissing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const decoded = decodeBrief(params.get("d"));
    if (decoded) setBrief(decoded);
    else setMissing(true);
  }, []);

  async function saveImage() {
    if (!cardRef.current) return;
    setSaving(true);
    try {
      const dataUrl = await exportCardImage(cardRef.current);
      const link = document.createElement("a");
      link.download = `提醒卡-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setSaving(false);
    }
  }

  if (missing) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="panel max-w-sm p-7 text-center">
          <p className="serif text-lg font-semibold">链接内容不完整</p>
          <p className="mt-2 text-sm leading-relaxed text-[#57514a]">
            可能复制时被聊天软件截断了，请让家人重新发一次。
          </p>
          <Link href="/" className="btn btn-ghost mt-5">
            自己查一条
          </Link>
        </div>
      </main>
    );
  }

  if (!brief) return <main className="min-h-screen" />;

  return (
    <main className="min-h-screen px-4 py-6 sm:py-10">
      <div className="page-frame mx-auto w-full" style={{ maxWidth: 750 }}>
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="h-px w-7" style={{ background: "var(--line-strong)" }} />
            <span className="eyebrow">家人发来的核验卡片</span>
          </div>
          <span className="metric hidden sm:inline">信息核验参考</span>
        </div>

        <FamilyCard ref={cardRef} brief={brief} />

        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
          <button type="button" onClick={saveImage} disabled={saving} className="btn btn-primary flex-1">
            {saving ? "正在生成…" : "保存长图"}
          </button>
          <Link href="/" className="btn btn-ghost flex-1">
            我也要查一条
          </Link>
        </div>

        <p className="metric mt-4 text-center leading-relaxed">
          本页内容由家人转发，信息核验仅供参考，不构成安全承诺
        </p>
      </div>
    </main>
  );
}
