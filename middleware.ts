import { NextRequest, NextResponse } from "next/server";
import { authCookieName, authSignature, getTrackerPassword } from "./app/auth";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const password = getTrackerPassword();

  if (!password) {
    if (pathname === "/login" || pathname === "/api/login") {
      return NextResponse.next();
    }

    return redirectToLogin(request, "missing-password");
  }

  const session = request.cookies.get(authCookieName)?.value ?? "";
  const isAuthenticated = session === await authSignature();

  if (pathname === "/login") {
    const nextPath = safeNextPath(request.nextUrl.searchParams.get("next") || "/");
    return isAuthenticated
      ? NextResponse.redirect(new URL(nextPath, request.url))
      : NextResponse.next();
  }

  if (isAuthenticated) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return redirectToLogin(request);
}

export const config = {
  matcher: [
    "/",
    "/sofi",
    "/api/state/:path*",
    "/api/sofi-state/:path*",
    "/login"
  ]
};

function redirectToLogin(request: NextRequest, error?: string) {
  const loginUrl = new URL("/login", request.url);

  if (error) {
    loginUrl.searchParams.set("error", error);
  }
  loginUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);

  return NextResponse.redirect(loginUrl);
}

function safeNextPath(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}
