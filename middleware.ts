import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const cookie = request.cookies.get('site-auth')
  const password = process.env.SITE_PASSWORD

  if (cookie?.value === password) {
    return NextResponse.next()
  }

  if (request.nextUrl.pathname === '/login') {
    return NextResponse.next()
  }

  const url = request.nextUrl.clone()
  url.pathname = '/login'
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
