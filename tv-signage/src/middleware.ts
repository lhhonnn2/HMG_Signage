import { NextRequest, NextResponse } from "next/server";

// Lightweight shared-password gate for the admin area. Not meant to be
// enterprise-grade auth — just keeps the config screens away from randoms.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!pathname.startsWith("/admin") || pathname.startsWith("/admin/login")) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get("admin_auth")?.value;
  if (cookie === process.env.ADMIN_PASSWORD) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/admin/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*"]
};
