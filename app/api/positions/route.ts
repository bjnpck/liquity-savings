import { NextRequest, NextResponse } from "next/server";
import { scanAllProtocols } from "@/lib/scanner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Allow up to 60s for all protocol fetches
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");

  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }

  try {
    const result = await scanAllProtocols(address, () => {});
    // Safe serialization — BigInt values from viem must be converted
    const body = JSON.stringify(result, (_key, val) =>
      typeof val === "bigint" ? val.toString() : val
    );
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[positions] scan error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Scan failed" },
      { status: 500 }
    );
  }
}
