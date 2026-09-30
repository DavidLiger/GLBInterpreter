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

  const t = request.nextUrl.searchParams.get("t");
  const query = t ? `?t=${encodeURIComponent(t)}` : "";

  // Location relative : résolue par le navigateur sur l'hôte réellement appelé
  // (tunnel, proxy, préversion), là où request.url peut valoir localhost.
  return new NextResponse(null, {
    status: 307,
    headers: {
      Location: `/webdiorama/${bookId}/${sceneId}${query}`,
      "X-Robots-Tag": "noindex, nofollow",
      "Cache-Control": "no-store",
    },
  });
}