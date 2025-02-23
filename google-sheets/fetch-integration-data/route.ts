import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { stackServerApp } from "@/stack"
import { decrypt, encrypt } from "../../utils/encryption"
import axios from "axios"

export async function GET() {
  try {
    const user = await stackServerApp.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const userId = user.id

    const integration = await prisma.integration.findFirst({
      where: {
        userId,
        integrationType: "GOOGLE_SHEETS",
      },
      select: {
        accessToken: true,
        refreshToken: true,
        tokenExpiresAt: true,
        integrationData: true,
        connectedStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!integration) {
      return NextResponse.json({ message: "Google Sheets integration not found" }, { status: 404 })
    }

    // Check if the token is expired and refresh if necessary
    if (integration.tokenExpiresAt && integration.tokenExpiresAt < new Date()) {
      const clientId = process.env.GOOGLE_SHEETS_CLIENT_ID
      const clientSecret = process.env.GOOGLE_SHEETS_CLIENT_SECRET

      if (!clientId || !clientSecret) {
        throw new Error("Missing required environment variables")
      }

      const refreshToken = decrypt(integration.refreshToken)
      const refreshResponse = await axios.post("https://oauth2.googleapis.com/token", {
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      })

      const { access_token, expires_in } = refreshResponse.data

      // Update the integration with the new access token and expiration
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          accessToken: encrypt(access_token),
          tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
        },
      })

      integration.accessToken = encrypt(access_token)
      integration.tokenExpiresAt = new Date(Date.now() + expires_in * 1000)
    }

    // Fetch a list of spreadsheets (you may want to implement pagination for a large number of spreadsheets)
    const accessToken = decrypt(integration.accessToken)
    const sheetsResponse = await axios.get("https://www.googleapis.com/drive/v3/files", {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        q: "mimeType='application/vnd.google-apps.spreadsheet'",
        fields: "files(id,name)",
      },
    })

    const spreadsheets = sheetsResponse.data.files

    return NextResponse.json({
      integration: {
        integrationData: integration.integrationData,
        connectedStatus: integration.connectedStatus,
        createdAt: integration.createdAt,
        updatedAt: integration.updatedAt,
        spreadsheets,
      },
    })
  } catch (error) {
    console.error("Error fetching Google Sheets integration data:", error)
    return NextResponse.json({ message: "Internal Server Error", details: (error as Error).message }, { status: 500 })
  }
}

