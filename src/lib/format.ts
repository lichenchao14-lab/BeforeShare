const DATE_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** 检索结果日期格式不统一（如 2026/10/04 10:55:00），统一按本地格式展示 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const normalized = value.replace(/\//g, "-");
  const time = Date.parse(normalized);
  if (Number.isNaN(time)) return value;
  return DATE_FORMATTER.format(new Date(time));
}
