import { NextResponse } from "next/server";
import crypto from "crypto";
import { stackServerApp } from "@/stack";

export async function GET() {
  const user = await stackServerApp.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const userId = user.id;
  const clientId = process.env.SALESFORCE_INTEGRATION_CLIENT_ID;
  const redirectUri = process.env.SALESFORCE_REDIRECT_URI;
  const scope = "api refresh_token";

  if (!clientId || !redirectUri) {
    console.error("Missing required environment variables");
    return NextResponse.json({ message: "Server configuration error" }, { status: 500 });
  }

  // Generate CSRF token and PKCE Code Verifier
  const csrfToken = crypto.randomBytes(16).toString("hex");
  const codeVerifier = crypto.randomBytes(32).toString("hex");
  const state = JSON.stringify({ csrfToken, codeVerifier });

  // Generate PKCE Code Challenge (SHA256 hash of Code Verifier, Base64URL encoded)
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64")
    .replace(/\+/g, "-") // Convert to base64url
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const authUrl = new URL("https://login.salesforce.com/services/oauth2/authorize");
  authUrl.searchParams.append("response_type", "code");
  authUrl.searchParams.append("client_id", clientId);
  authUrl.searchParams.append("redirect_uri", redirectUri);
  authUrl.searchParams.append("state", state);
  authUrl.searchParams.append("scope", scope);
  authUrl.searchParams.append("code_challenge", codeChallenge);
  authUrl.searchParams.append("code_challenge_method", "S256");

  return NextResponse.redirect(authUrl.toString());
}
