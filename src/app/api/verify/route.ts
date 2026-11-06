import { NextResponse } from "next/server";
import { verify } from "@/lib/pipeline";
import type { FamilyState, VerificationResult } from "@/lib/types";

export interface VerifyRequestBody {
  text: string;
  familyState: FamilyState;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VerifyRequestBody;
    const result = await verify(body.text, body.familyState);
    return NextResponse.json(result satisfies VerificationResult);
  } catch (error) {
    return NextResponse.json(
      { failure: error instanceof Error ? error.message : "未知错误" },
      { status: 400 },
    );
  }
}
