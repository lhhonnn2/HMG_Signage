import type { NextRequest } from "next/server";

// Same shared-password cookie the /admin middleware checks. The middleware only
// covers /admin pages, so admin-only API routes must call this themselves.
export function isAdmin(req: NextRequest): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  return !!pw && req.cookies.get("admin_auth")?.value === pw;
}
