import { NextResponse } from "next/server"
import crypto from "crypto"
import { stackServerApp } from "@/stack"

export async function GET() {
  const user = await stackServerApp.getUser()
  if (!user) {
    console.error("Unauthorized: No user found")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = user.id
  const clientId = process.env.GOOGLESHEETS_INTEGRATION_CLIENT_ID
  const redirectUri = process.env.GOOGLESHEETS_REDIRECT_URI
  const scope = "https://www.googleapis.com/auth/spreadsheets.readonly"

  console.log("Environment variables check:", {
    clientId: clientId ? "Set" : "Missing",
    redirectUri: redirectUri ? "Set" : "Missing",
  })

  if (!clientId || !redirectUri) {
    console.error("Missing required environment variables:", {
      clientId: !clientId,
      redirectUri: !redirectUri,
    })
    return NextResponse.json({ message: "Server configuration error" }, { status: 500 })
  }

  const csrfToken = crypto.randomBytes(16).toString("hex")
  const state = JSON.stringify({ csrfToken, userId })

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  authUrl.searchParams.append("client_id", clientId)
  authUrl.searchParams.append("redirect_uri", redirectUri)
  authUrl.searchParams.append("response_type", "code")
  authUrl.searchParams.append("scope", scope)
  authUrl.searchParams.append("access_type", "offline")
  authUrl.searchParams.append("prompt", "consent")
  authUrl.searchParams.append("state", state)

  console.log("Redirecting to Google OAuth URL:", authUrl.toString())

  return NextResponse.redirect(authUrl.toString())
}

