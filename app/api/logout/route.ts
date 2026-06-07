import { NextResponse } from "next/server";
import { authCookieName } from "../../auth";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url), 303);

  response.cookies.set({
    name: authCookieName,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });

  return response;
}
