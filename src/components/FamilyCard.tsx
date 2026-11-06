"use client";

import React, { forwardRef } from "react";
import { formatDate } from "@/lib/format";
import type { FamilyBrief } from "@/lib/types";

export const CARD_WIDTH = 750;

const SERIF =
  '"Source Han Serif SC", "Noto Serif SC", "Source Serif 4", "Iowan Old Style", "Palatino Linotype", "Songti SC", "STSong", SimSun, Georgia, serif';
const SANS =
  '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
const MONO = '"SFMono-Regular", "JetBrains Mono", Consolas, monospace';

/**
 * 家人提醒卡：固定 750px 宽度，正文不小于 18px，行高不小于 1.6。
 * 不使用任何官方徽标或"国家/公安"字样，底部固定免责与紧急电话。
 */
export const FamilyCard = forwardRef<HTMLDivElement, { brief: FamilyBrief }>(
  function FamilyCard({ brief }, ref) {
    return (
      <div
        ref={ref}
        style={{
          width: `${CARD_WIDTH}px`,
          maxWidth: "100%",
          backgroundColor: "#fbf7ef",
          padding: "34px 32px",
          boxSizing: "border-box",
          fontFamily: SANS,
        }}
      >
        <div
          style={{
            backgroundColor: "#fffdf8",
            borderRadius: "18px",
            border: "1px solid #e3dbcc",
            padding: "34px 30px",
            boxShadow: "0 14px 34px -28px rgba(70, 52, 30, 0.65)",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              fontFamily: MONO,
              fontSize: "12px",
              letterSpacing: "0.14em",
              color: "#93401f",
              marginBottom: "18px",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: "18px",
                height: "1px",
                backgroundColor: "#c9927c",
              }}
            />
            这条消息需要先停一停
          </div>

          <p
            style={{
              fontFamily: SERIF,
              fontSize: "27px",
              lineHeight: 1.5,
              fontWeight: 600,
              color: "#221f1c",
              margin: "0 0 26px",
            }}
          >
            {brief.conclusion}
          </p>

          {brief.evidence.length > 0 && (
            <div style={{ marginBottom: "26px" }}>
              <p
                style={{
                  fontSize: "18px",
                  lineHeight: 1.6,
                  color: "#857c70",
                  margin: "0 0 12px",
                }}
              >
                同类情况已被公开通报：
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {brief.evidence.map((ev, index) => (
                  <div
                    key={`${ev.site}-${index}`}
                    style={{
                      backgroundColor: "#f9f5ec",
                      borderLeft: "2px solid #d2c7b3",
                      borderRadius: "8px",
                      padding: "13px 16px",
                    }}
                  >
                    <p
                      style={{
                        fontSize: "19px",
                        lineHeight: 1.6,
                        color: "#221f1c",
                        margin: 0,
                        fontWeight: 500,
                      }}
                    >
                      {ev.title}
                    </p>
                    <p
                      style={{
                        fontFamily: MONO,
                        fontSize: "13px",
                        lineHeight: 1.6,
                        color: "#6f6558",
                        margin: "7px 0 0",
                      }}
                    >
                      {ev.site}
                      {ev.publishedAt ? ` · ${formatDate(ev.publishedAt)}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div
            style={{
              backgroundColor: "#f3e2d8",
              border: "1px solid #e6cbbd",
              borderRadius: "10px",
              padding: "18px 20px",
              marginBottom: "20px",
            }}
          >
            <p
              style={{
                fontFamily: SERIF,
                fontSize: "21px",
                lineHeight: 1.65,
                fontWeight: 600,
                color: "#7f3416",
                margin: 0,
              }}
            >
              {brief.action}
            </p>
          </div>

          <p
            style={{
              fontSize: "18px",
              lineHeight: 1.7,
              color: "#57514a",
              margin: 0,
            }}
          >
            {brief.channel}
          </p>

          <div
            style={{
              marginTop: "26px",
              paddingTop: "16px",
              borderTop: "1px solid #e3dbcc",
              fontSize: "14px",
              lineHeight: 1.7,
              color: "#6f6558",
              textAlign: "center",
            }}
          >
            {brief.disclaimer}
          </div>
        </div>
      </div>
    );
  },
);
