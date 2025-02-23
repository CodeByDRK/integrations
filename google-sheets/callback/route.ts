import { NextResponse } from "next/server"
import axios from "axios"
import prisma from "@/lib/prisma"
import { encrypt } from "../../utils/encryption"
import { stackServerApp } from "@/stack"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const error = url.searchParams.get("error")
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")

  if (error) {
    return NextResponse.json(
      {
        message: "Authorization Error",
        error,
        error_description: url.searchParams.get("error_description"),
      },
      { status: 400 },
    )
  }

  if (!code || !state) {
    return NextResponse.json({ message: "Missing required parameters" }, { status: 400 })
  }

  try {
    const { userId } = JSON.parse(state)
    const user = await stackServerApp.getUser()
    if (!user || user.id !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const clientId = process.env.GOOGLESHEETS_INTEGRATION_CLIENT_IDS
    const clientSecret = process.env.GOOGLESHEETS_INTEGRATION_CLIENT_SECRET
    const redirectUri = process.env.GOOGLESHEETS_REDIRECT_URI

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error("Missing required environment variables")
    }

    const tokenResponse = await axios.post("https://oauth2.googleapis.com/token", {
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    })

    const { access_token, refresh_token, expires_in } = tokenResponse.data

    // Fetch user info
    const userInfoResponse = await axios.get("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    })

    const userData = userInfoResponse.data

    let integration = await prisma.integration.findFirst({
      where: { userId, integrationType: "GOOGLE_SHEETS" },
    })

    if (integration) {
      integration = await prisma.integration.update({
        where: { id: integration.id },
        data: {
          accessToken: encrypt(access_token),
          refreshToken: encrypt(refresh_token),
          tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
          connectedStatus: true,
          integrationData: userData,
        },
      })
    } else {
      integration = await prisma.integration.create({
        data: {
          userId,
          integrationType: "GOOGLE_SHEETS",
          accessToken: encrypt(access_token),
          refreshToken: encrypt(refresh_token),
          tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
          connectedStatus: true,
          updatedAt: new Date(),
        },
      })
    }

    return new NextResponse(renderSuccessHtml(), {
      headers: { "Content-Type": "text/html" },
    })
  } catch (error: any) {
    console.error("Error:", error.response?.data || error.message)
    return NextResponse.json(
      {
        message: "Error processing request",
        details: error.response?.data || error.message || "Unknown error occurred",
      },
      { status: 500 },
    )
  }
}

function renderSuccessHtml() {
  return `
    <html>
      <body>
        <div>Google Sheets connected successfully</div>
        <script>
          setTimeout(() => {
            window.opener.postMessage({ type: 'GOOGLE_SHEETS_INTEGRATION_COMPLETE' }, '*');
            window.close();
          }, 3000);
        </script>
      </body>
    </html>
  `
}

