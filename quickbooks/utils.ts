import prisma from "@/lib/prisma"
import { decrypt, encrypt } from "../utils/encryption"
import axios from "axios"

export async function getQuickBooksAccessToken(userId: string) {
  const integration = await prisma.integration.findFirst({
    where: { userId, integrationType: "QUICKBOOKS" },
  })

  if (!integration || !integration.connectedStatus) {
    throw new Error("QuickBooks integration not found or not connected")
  }

  if (integration.tokenExpiresAt && new Date(integration.tokenExpiresAt) < new Date()) {
    const newTokens = await refreshQuickBooksToken(integration.refreshToken!, userId)
    if (!newTokens) {
      throw new Error("Failed to refresh token")
    }
    return newTokens.accessToken
  }

  return decrypt(integration.accessToken!)
}

async function refreshQuickBooksToken(refreshToken: string, userId: string) {
  try {
    const decryptedRefreshToken = decrypt(refreshToken)
    const clientId = process.env.QUICKBOOKS_CLIENT_ID
    const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET

    const tokenResponse = await axios.post(
      "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: decryptedRefreshToken,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        },
      },
    )

    const { access_token, refresh_token, expires_in } = tokenResponse.data

    const integration = await prisma.integration.findFirst({
      where: { userId, integrationType: "QUICKBOOKS" },
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
    console.error("Error refreshing QuickBooks token:", error)
    return null
  }
}

export function getQuickBooksApiUrl(realmId: string) {
  return `https://quickbooks.api.intuit.com/v3/company/${realmId}`
}

