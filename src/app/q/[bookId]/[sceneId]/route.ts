import { NextResponse, type NextRequest } from "next/server";

// 0.2.a — URL canonique des QR : valide les segments puis redirige (307) vers la scène.
// La vérification du token reste sur la page cible.
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bookId: string; sceneId: string }> },
) {
  const { bookId, sceneId } = await params;

  if (!ID_RE.test(bookId) || !ID_RE.test(sceneId)) {
    return new NextResponse("Not Found", {
      status: 404,
      headers: { "X-Robots-Tag": "noindex, nofollow" },
    });
  }

  const target = new URL(`/webdiorama/${bookId}/${sceneId}`, request.url);
  const t = request.nextUrl.searchParams.get("t");
  if (t) target.searchParams.set("t", t);

  const res = NextResponse.redirect(target, 307);
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Cache-Control", "no-store");
  return res;
}