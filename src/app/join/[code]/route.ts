import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_GROUP_COOKIE } from "@/lib/data";

/**
 * Invite link: /join/<code>.
 * Signed out → the sign-up form. Signed in → join the group straight away.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/join/[code]">) {
  const { code: raw } = await ctx.params;
  const code = raw.toLowerCase();
  const origin = request.nextUrl.origin;
  if (!/^[0-9a-f]{12}$/.test(code)) return NextResponse.redirect(new URL("/signup", origin));

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.redirect(new URL(`/signup?code=${code}`, origin));

  const { data, error } = await supabase.rpc("join_group", { p_code: code });
  if (error || !data) return NextResponse.redirect(new URL("/onboarding?invalid=1", origin));

  const res = NextResponse.redirect(new URL("/", origin));
  res.cookies.set(ACTIVE_GROUP_COOKIE, data as string, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
