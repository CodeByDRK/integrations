import { NextResponse } from "next/server"
import crypto from "crypto"
import { stackServerApp } from "@/stack"

export async function GET() {
  const user = await stackServerApp.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = user.id
  const clientId = process.env.NOTION_INTEGRATION_CLIENT_ID
  const redirectUri = process.env.NOTION_INTEGRATION_REDIRECT_URI
  const scope = "read_content read_databases read_pages"

  if (!clientId || !redirectUri) {
    console.error("Missing required environment variables")
    return NextResponse.json({ message: "Server configuration error" }, { status: 500 })
  }

  const csrfToken = crypto.randomBytes(16).toString("hex")
  const state = JSON.stringify({ csrfToken })

  const authUrl = new URL("https://api.notion.com/v1/oauth/authorize")
  authUrl.searchParams.append("client_id", clientId)
  authUrl.searchParams.append("redirect_uri", redirectUri)
  authUrl.searchParams.append("response_type", "code")
  authUrl.searchParams.append("owner", "user")
  authUrl.searchParams.append("scope", scope)
  authUrl.searchParams.append("state", state)

  return NextResponse.redirect(authUrl.toString())
}

