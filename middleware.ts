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
    return isAuthenticated
      ? NextResponse.redirect(new URL("/", request.url))
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
    "/api/state/:path*",
    "/login"
  ]
};

function redirectToLogin(request: NextRequest, error?: string) {
  const loginUrl = new URL("/login", request.url);

  if (error) {
    loginUrl.searchParams.set("error", error);
  }

  return NextResponse.redirect(loginUrl);
}
