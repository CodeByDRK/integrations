import { NextResponse } from "next/server"
import crypto from "crypto"
import { stackServerApp } from "@/stack"

export async function GET() {
  const user = await stackServerApp.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = user.id
  const clientId = process.env.SLACK_INTEGRATION_CLIENT_SECRET
  const redirectUri = process.env.SLACK_INTEGRATION_REDIRECT_URI
  const scope = "channels:read,chat:write,team:read,users:read"

  if (!clientId || !redirectUri) {
    console.error("Missing required environment variables")
    return NextResponse.json({ message: "Server configuration error" }, { status: 500 })
  }

  const csrfToken = crypto.randomBytes(16).toString("hex")
  const state = JSON.stringify({ csrfToken, userId })

  const authUrl = new URL("https://slack.com/oauth/v2/authorize")
  authUrl.searchParams.append("client_id", clientId)
  authUrl.searchParams.append("scope", scope)
  authUrl.searchParams.append("redirect_uri", redirectUri)
  authUrl.searchParams.append("state", state)

  return NextResponse.redirect(authUrl.toString())
}

