import { NextResponse } from "next/server";
import { authCookieName, authSignature, getTrackerPassword } from "../../auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const password = String(form.get("password") ?? "");
  const expectedPassword = getTrackerPassword();

  if (!expectedPassword) {
    return NextResponse.redirect(new URL("/login?error=missing-password", request.url), 303);
  }

  if (password !== expectedPassword) {
    return NextResponse.redirect(new URL("/login?error=invalid", request.url), 303);
  }

  const response = NextResponse.redirect(new URL("/", request.url), 303);

  response.cookies.set({
    name: authCookieName,
    value: await authSignature(),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });

  return response;
}
