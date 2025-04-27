// src/app/api/Down/Hash/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();
  const { quizId, fileName, encrypted } = body;

  if (!quizId || !fileName || !encrypted) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const buffer = Buffer.from(encrypted, "utf-8");
  return new Response(buffer, {
    headers: {
      "Content-Type": "text/plain",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
