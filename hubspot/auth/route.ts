import { NextResponse } from "next/server"
import crypto from "crypto"
import { stackServerApp } from "@/stack"

export async function GET() {
  const user = await stackServerApp.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const userId = user.id
  const clientId = process.env.HUBSPOT_INTEGRATION_CLIENT_ID
  const redirectUri = process.env.HUBSPOT_REDIRECT_URI
  const scope = [
    "business-intelligence",
    "crm.lists.read",
    "crm.objects.companies.read",
    "crm.objects.contacts.read",
    "crm.objects.deals.read",
    "crm.schemas.custom.read",
  ].join(" ") // Join scopes into a space-separated string

  if (!clientId || !redirectUri) {
    console.error("Missing required environment variables")
    return NextResponse.json({ message: "Server configuration error" }, { status: 500 })
  }

  const csrfToken = crypto.randomBytes(16).toString("hex")
  const state = JSON.stringify({ csrfToken })

  const authUrl = new URL("https://app.hubspot.com/oauth/authorize")
  authUrl.searchParams.append("client_id", clientId)
  authUrl.searchParams.append("redirect_uri", redirectUri)
  authUrl.searchParams.append("scope", scope)
  authUrl.searchParams.append("state", state)

  return NextResponse.redirect(authUrl.toString())
}

