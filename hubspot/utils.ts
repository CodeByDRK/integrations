import prisma from "@/lib/prisma"
import { decrypt, encrypt } from "../utils/encryption"
import axios from "axios"

export async function getHubSpotAccessToken(userId: string) {
  const integration = await prisma.integration.findFirst({
    where: { userId, integrationType: "HUBSPOT" },
  })

  if (!integration || !integration.connectedStatus) {
    throw new Error("HubSpot integration not found or not connected")
  }

  if (integration.tokenExpiresAt && new Date(integration.tokenExpiresAt) < new Date()) {
    const newTokens = await refreshHubSpotToken(integration.refreshToken!, userId)
    if (!newTokens) {
      throw new Error("Failed to refresh token")
    }
    return newTokens.accessToken
  }

  return decrypt(integration.accessToken!)
}

async function refreshHubSpotToken(refreshToken: string, userId: string) {
  try {
    const decryptedRefreshToken = decrypt(refreshToken)
    const clientId = process.env.HUBSPOT_INTEGRATION_CLIENT_ID
    const clientSecret = process.env.HUBSPOT_INTEGRATION_CLIENT_SECRET

    const tokenResponse = await axios.post(
      "https://api.hubapi.com/oauth/v1/token",
      new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId!,
        client_secret: clientSecret!,
        refresh_token: decryptedRefreshToken,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    )

    const { access_token, refresh_token, expires_in } = tokenResponse.data

    const integration = await prisma.integration.findFirst({
      where: { userId, integrationType: "HUBSPOT" },
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
    console.error("Error refreshing HubSpot token:", error)
    return null
  }
}

