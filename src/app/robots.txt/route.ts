// app/robots.txt/route.ts
export async function GET() {
  const robotsTxt = `User-agent: *
Allow: /

Sitemap: https://editions-liger.com/sitemap.xml`;

  return new Response(robotsTxt, {
    headers: {
      'Content-Type': 'text/plain',
    },
  });
}