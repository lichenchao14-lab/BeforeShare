import { NextResponse } from "next/server";
import { sanitize, validateInput } from "@/lib/intake/sanitize";

/** 脱敏预览：让用户在正式检索前确认替换结果 */
export async function POST(request: Request) {
  const body = (await request.json()) as { text?: string };
  const text = body.text ?? "";
  const error = validateInput(text);
  if (error) {
    return NextResponse.json({ failure: error }, { status: 400 });
  }
  const { sanitizedText, redactions } = sanitize(text);
  return NextResponse.json({ sanitizedText, redactions });
}
