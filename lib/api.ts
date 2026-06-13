import { NextResponse } from "next/server";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function okNoStore<T>(data: T, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store, max-age=0");
  return NextResponse.json(data, { ...init, headers });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function shouldForceRefresh(request: Request) {
  const { searchParams } = new URL(request.url);
  return ["1", "true", "yes"].includes((searchParams.get("refresh") ?? "").toLowerCase());
}
