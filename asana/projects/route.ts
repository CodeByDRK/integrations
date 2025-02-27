import { NextResponse } from "next/server"
import axios from "axios"
import prisma from "@/lib/prisma"
import { decrypt, encrypt } from "../../utils/encryption"
import { stackServerApp } from "@/stack"

// GET: Fetch Asana projects from the workspace
export async function GET(req: Request) {
  try {
    const user = await stackServerApp.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = user.id

    // Get the integration from the database
    const integration = await prisma.integration.findFirst({
      where: { userId, integrationType: "ASANA" },
    })

    if (!integration || !integration.connectedStatus) {
      return NextResponse.json({ error: "Asana integration not found or not connected" }, { status: 404 })
    }

    // Decrypt the access token
    const accessToken = decrypt(integration.accessToken!)
    const workspaceId = integration.workSpaceId

    // Check if token is expired and refresh if needed
    if (integration.tokenExpiresAt && new Date(integration.tokenExpiresAt) < new Date()) {
      const newTokens = await refreshAsanaToken(integration.refreshToken!, userId)
      if (!newTokens) {
        return NextResponse.json({ error: "Failed to refresh token" }, { status: 401 })
      }
    }

    // Fetch projects from the workspace
    const projectsResponse = await axios.get(`https://app.asana.com/api/1.0/workspaces/${workspaceId}/projects`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    return NextResponse.json({ projects: projectsResponse.data.data })
  } catch (error: any) {
    console.error("Error fetching Asana projects:", error.response?.data || error.message)
    return NextResponse.json(
      { error: "Failed to fetch Asana projects", details: error.response?.data || error.message },
      { status: 500 },
    )
  }
}

// Helper function to refresh the Asana token
async function refreshAsanaToken(refreshToken: string, userId: string) {
  try {
    const decryptedRefreshToken = decrypt(refreshToken)
    const clientId = process.env.ASANA_INTEGRATION_CLIENT_ID
    const clientSecret = process.env.ASANA_INTEGRATION_CLIENT_SECRET

    const tokenResponse = await axios.post(
      "https://app.asana.com/-/oauth_token",
      {
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: decryptedRefreshToken,
      },
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    )

    const { access_token, refresh_token, expires_in } = tokenResponse.data

    // Find the integration first
    const integration = await prisma.integration.findFirst({
      where: {
        userId: userId,
        integrationType: "ASANA",
      },
    })

    if (!integration) {
      throw new Error("Integration not found")
    }

    // Update the tokens in the database
    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        accessToken: encrypt(access_token),
        refreshToken: encrypt(refresh_token),
        tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
      },
    })

    return { accessToken: access_token }
  } catch (error) {
    console.error("Error refreshing Asana token:", error)
    return null
  }
}

