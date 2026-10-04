import { NextResponse, type NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  if (
    request.nextUrl.pathname.startsWith('/admin') &&
    process.env.NODE_ENV !== 'development' &&
    process.env.NEXT_PUBLIC_AUTH_ENABLED !== 'true'
  ) {
    return new NextResponse(null, { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/admin/:path*',
};
