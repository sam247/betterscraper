import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function getCredentials(): { user: string; password: string } | null {
  const combined = process.env.BASIC_AUTH_CREDENTIALS;
  if (combined) {
    const [user, password] = combined.split(":");
    if (user && password) return { user, password };
  }
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;
  if (user && password) return { user, password };
  return null;
}

export function middleware(req: NextRequest) {
  const creds = getCredentials();
  if (!creds) {
    return NextResponse.next();
  }

  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Basic ")) {
    return new NextResponse("Auth required", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Better Scraper"',
      },
    });
  }

  try {
    const value = auth.slice(6);
    const decoded = Buffer.from(value, "base64").toString("utf8");
    const [user, password] = decoded.split(":");
    if (user === creds.user && password === creds.password) {
      return NextResponse.next();
    }
  } catch {
    // invalid base64
  }

  return new NextResponse("Invalid credentials", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Better Scraper"',
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
