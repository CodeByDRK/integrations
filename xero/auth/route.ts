import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import crypto from "crypto";
import { stackServerApp } from "@/stack";

export async function GET(req: NextRequest) {
  const user = await stackServerApp.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = user.id
  const clientId = process.env.XERO_CLIENT_INTEGRATION_ID;
  const redirectUri = process.env.XERO_INTEGRATION_REDIRECT_URI;
  const scope =
    "openid profile email accounting.transactions accounting.reports.read offline_access";

  if (!clientId || !redirectUri) {
    console.error("Missing required environment variables");
    return NextResponse.json(
      { message: "Server configuration error" },
      { status: 500 }
    );
  }

  const csrfToken = crypto.randomBytes(16).toString("hex");
  const state = JSON.stringify({ csrfToken });

  const authUrl = new URL("https://login.xero.com/identity/connect/authorize");
  authUrl.searchParams.append("client_id", clientId);
  authUrl.searchParams.append("redirect_uri", redirectUri);
  authUrl.searchParams.append("response_type", "code");
  authUrl.searchParams.append("scope", scope);
  authUrl.searchParams.append("state", state);

  return NextResponse.redirect(authUrl.toString());
}
