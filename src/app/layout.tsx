import type { Metadata, Viewport } from "next";
import React from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "反诈鉴谎师",
  description:
    "家人已经在聊了，我怎么劝得动？给你一段话术，产出可转发的提醒卡，帮你说清楚为什么是骗局。",
};

export const viewport: Viewport = {
  themeColor: "#f6f2ea",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
