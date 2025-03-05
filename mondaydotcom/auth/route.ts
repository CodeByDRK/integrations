// app/api/monday/auth/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { stackServerApp } from "@/stack";

export async function GET(req: NextRequest) {
  const user = await stackServerApp.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;
  const clientId = process.env.MONDAYDOTCOM_CLIENT_ID;
  const redirectUri = process.env.MONDAYDOTCOM_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    console.error("Missing required environment variables");
    return NextResponse.json(
      { message: "Server configuration error" },
      { status: 500 }
    );
  }

  // Generate a CSRF token for security
  const csrfToken = crypto.randomBytes(16).toString("hex");
  const state = JSON.stringify({ csrfToken, userId });

  // Construct the Monday.com authorization URL
  const authUrl = new URL("https://auth.monday.com/oauth2/authorize");
  authUrl.searchParams.append("client_id", clientId);
  authUrl.searchParams.append("redirect_uri", redirectUri);
  authUrl.searchParams.append("response_type", "code");
  authUrl.searchParams.append("state", state);

  return NextResponse.redirect(authUrl.toString());
}