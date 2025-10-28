// app/api/assets/[...path]/route.ts - COMPATIBLE Next.js 15+

import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';

const R2_WORKER_URL = process.env.R2_WORKER_URL!;
const SECRET_KEY = process.env.ASSET_SECRET_KEY!;
const ALLOWED_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || 'https://faerium-site.vercel.app';
const isDevelopment = process.env.NODE_ENV === 'development';
const R2_PREFIX = process.env.R2_ASSET_PREFIX || 'webdioramas/assets';

function generateToken(path: string, expiresAt: number): string {
  const payload = `${path}:${expiresAt}`;
  const signature = createHmac('sha256', SECRET_KEY)
    .update(payload)
    .digest('hex');
  return `${Buffer.from(payload).toString('base64')}.${signature}`;
}

function verifyToken(token: string): { path: string; expiresAt: number } | null {
  try {
    const [payloadBase64, signature] = token.split('.');
    const payload = Buffer.from(payloadBase64, 'base64').toString('utf-8');
    
    const expectedSignature = createHmac('sha256', SECRET_KEY)
      .update(payload)
      .digest('hex');
    
    if (signature !== expectedSignature) {
      return null;
    }
    
    const [path, expiresAtStr] = payload.split(':');
    const expiresAt = parseInt(expiresAtStr, 10);
    
    if (Date.now() > expiresAt) {
      return null;
    }
    
    return { path, expiresAt };
  } catch {
    return null;
  }
}

// ✅ Next.js 15+ : params est maintenant une Promise
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // ✅ Await params
  const { path } = await params;
  
  const origin = request.headers.get('origin') || '';
  
  // Vérification origin
  let isAllowedOrigin = false;
  
  if (origin) {
    isAllowedOrigin = isDevelopment 
      ? origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')
      : origin === ALLOWED_ORIGIN;
  } else {
    const referer = request.headers.get('referer') || '';
    
    if (isDevelopment) {
      isAllowedOrigin = true;
    } else {
      isAllowedOrigin = referer.startsWith(ALLOWED_ORIGIN);
    }
  }
  
  if (!isAllowedOrigin) {
    return NextResponse.json(
      { 
        error: 'Origin not allowed', 
        received: origin,
        referer: request.headers.get('referer'),
        isDev: isDevelopment 
      },
      { status: 403 }
    );
  }
  
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Missing authorization token' },
      { status: 401 }
    );
  }
  
  const token = authHeader.substring(7);
  const verified = verifyToken(token);
  
  if (!verified) {
    return NextResponse.json(
      { error: 'Invalid or expired token' },
      { status: 401 }
    );
  }
  
  const objectKey = path.join('/');
  
  if (verified.path !== objectKey) {
    return NextResponse.json(
      { 
        error: 'Token does not match requested path',
        tokenPath: verified.path,
        requestPath: objectKey,
      },
      { status: 403 }
    );
  }
  
  try {
    // Construire le chemin complet R2
    const fullR2Path = R2_PREFIX ? `${R2_PREFIX}/${objectKey}` : objectKey;
    
    console.log('🔍 Fetching from R2:', fullR2Path);
    
    const r2Response = await fetch(`${R2_WORKER_URL}/${fullR2Path}`, {
      headers: {
        'User-Agent': 'NextJS-Internal-Proxy',
      },
    });
    
    if (!r2Response.ok) {
      console.error(`❌ R2 returned ${r2Response.status} for path: ${fullR2Path}`);
      return NextResponse.json(
        { 
          error: 'Asset not found', 
          status: r2Response.status,
          r2Path: fullR2Path,
          workerUrl: R2_WORKER_URL,
        },
        { status: r2Response.status }
      );
    }
    
    const buffer = await r2Response.arrayBuffer();
    
    let contentType = 'application/octet-stream';
    if (objectKey.endsWith('.glb')) contentType = 'model/gltf-binary';
    else if (objectKey.endsWith('.json')) contentType = 'application/json';
    else if (objectKey.endsWith('.png')) contentType = 'image/png';
    else if (objectKey.endsWith('.jpg') || objectKey.endsWith('.jpeg')) contentType = 'image/jpeg';
    else if (objectKey.endsWith('.webp')) contentType = 'image/webp';
    else if (objectKey.endsWith('.gif')) contentType = 'image/gif';
    else if (objectKey.endsWith('.mp3')) contentType = 'audio/mpeg';
    else if (objectKey.endsWith('.mp4')) contentType = 'video/mp4';
    
    const allowedOriginHeader = origin || ALLOWED_ORIGIN;
    
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': buffer.byteLength.toString(),
        'Cache-Control': 'private, max-age=3600',
        'Access-Control-Allow-Origin': allowedOriginHeader,
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Authorization',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Error fetching asset:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin') || ALLOWED_ORIGIN;
  
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}