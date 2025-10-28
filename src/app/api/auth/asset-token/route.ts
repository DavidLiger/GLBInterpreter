// app/api/auth/asset-token/route.ts - VERSION CORRIGÉE pour origin vide
import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';

const SECRET_KEY = process.env.ASSET_SECRET_KEY!;
const ALLOWED_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || 'https://votre-app.vercel.app';
const TOKEN_VALIDITY_MS = 5 * 60 * 1000; // 5 minutes
const isDevelopment = process.env.NODE_ENV === 'development';

function generateToken(path: string, expiresAt: number): string {
  const payload = `${path}:${expiresAt}`;
  const signature = createHmac('sha256', SECRET_KEY)
    .update(payload)
    .digest('hex');
  return `${Buffer.from(payload).toString('base64')}.${signature}`;
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin') || '';
  
  // ✅ FIX : Gérer les requêtes sans origin (same-origin ou server-side)
  let isAllowedOrigin = false;
  
  if (origin) {
    // Origin présent : vérifier normalement
    isAllowedOrigin = isDevelopment 
      ? origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')
      : origin === ALLOWED_ORIGIN;
  } else {
    // Origin absent : vérifier le referer ou accepter en dev
    const referer = request.headers.get('referer') || '';
    
    if (isDevelopment) {
      // En dev, accepter les requêtes sans origin
      isAllowedOrigin = true;
    } else {
      // En prod, vérifier que le referer commence par l'URL autorisée
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
  
  try {
    const body = await request.json();
    const { path } = body;
    
    if (!path || typeof path !== 'string') {
      return NextResponse.json(
        { error: 'Invalid path' },
        { status: 400 }
      );
    }
    
    const expiresAt = Date.now() + TOKEN_VALIDITY_MS;
    const token = generateToken(path, expiresAt);
    
    const allowedOriginHeader = origin || ALLOWED_ORIGIN;
    
    return NextResponse.json(
      { 
        token,
        expiresAt,
        path,
      },
      {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': allowedOriginHeader,
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('Error generating token:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}