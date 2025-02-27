import prisma from "@/lib/prisma"
import { decrypt, encrypt } from "../utils/encryption"
import axios from "axios"

export async function getNotionAccessToken(userId: string) {
  const integration = await prisma.integration.findFirst({
    where: { userId, integrationType: "NOTION" },
  })

  if (!integration || !integration.connectedStatus) {
    throw new Error("Notion integration not found or not connected")
  }

  if (integration.tokenExpiresAt && new Date(integration.tokenExpiresAt) < new Date()) {
    const newTokens = await refreshNotionToken(integration.refreshToken!, userId)
    if (!newTokens) {
      throw new Error("Failed to refresh token")
    }
    return newTokens.accessToken
  }

  return decrypt(integration.accessToken!)
}

async function refreshNotionToken(refreshToken: string, userId: string) {
  try {
    const decryptedRefreshToken = decrypt(refreshToken)
    const clientId = process.env.NOTION_INTEGRATION_CLIENT_ID
    const clientSecret = process.env.NOTION_INTEGRATION_CLIENT_SECRET

    const tokenResponse = await axios.post(
      "https://api.notion.com/v1/oauth/token",
      {
        grant_type: "refresh_token",
        refresh_token: decryptedRefreshToken,
      },
      {
        auth: {
          username: clientId!,
          password: clientSecret!,
        },
        headers: {
          "Content-Type": "application/json",
        },
      }
    )

    const { access_token, refresh_token, expires_in } = tokenResponse.data

    const integration = await prisma.integration.findFirst({
      where: { userId, integrationType: "NOTION" },
    })

    if (!integration) {
      throw new Error("Integration not found")
    }

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
    console.error("Error refreshing Notion token:", error)
    return null
  }
}
