import { ImageResponse } from "next/og";

export async function GET(_: Request, ctx: RouteContext<"/icons/[size]">) {
  const { size: raw } = await ctx.params;
  const size = raw === "512" ? 512 : raw === "180" ? 180 : 192;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #f43f5e, #ec4899)",
          color: "white",
          fontSize: size * 0.55,
          fontWeight: 800,
        }}
      >
        ₹
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=604800, immutable" } },
  );
}
