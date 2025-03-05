import { NextResponse } from "next/server"
import axios from "axios"
import prisma from "@/lib/prisma"
import { stackServerApp } from "@/stack"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const error = url.searchParams.get("error")
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")

  console.log("Received callback with params:", {
    error,
    code: code ? "Set" : "Missing",
    state: state ? "Set" : "Missing",
  })

  if (error) {
    console.error("Authorization Error:", error, url.searchParams.get("error_description"))
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
    console.error("Missing required parameters:", { code: !code, state: !state })
    return NextResponse.json({ message: "Missing required parameters" }, { status: 400 })
  }

  try {
    const { userId } = JSON.parse(state)
    const user = await stackServerApp.getUser()
    if (!user || user.id !== userId) {
      console.error("Unauthorized: User mismatch or not found")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const clientId = process.env.GOOGLESHEETS_INTEGRATION_CLIENT_ID
    const clientSecret = process.env.GOOGLESHEETS_INTEGRATION_CLIENT_SECRET
    const redirectUri = process.env.GOOGLESHEETS_REDIRECT_URI

    console.log("Environment variables check:", {
      clientId: clientId ? "Set" : "Missing",
      clientSecret: clientSecret ? "Set" : "Missing",
      redirectUri: redirectUri ? "Set" : "Missing",
    })

    if (!clientId || !clientSecret || !redirectUri) {
      console.error("Missing required environment variables:", {
        clientId: !clientId,
        clientSecret: !clientSecret,
        redirectUri: !redirectUri,
      })
      throw new Error("Missing required environment variables")
    }

    console.log("Exchanging code for token...")
    const tokenResponse = await axios.post("https://oauth2.googleapis.com/token", {
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    })

    console.log("Token received successfully")
    const { access_token, refresh_token, expires_in } = tokenResponse.data

    let integration = await prisma.integration.findFirst({
      where: { userId, integrationType: "GOOGLE_SHEETS" },
    })

    if (integration) {
      console.log("Updating existing integration...")
      integration = await prisma.integration.update({
        where: { id: integration.id },
        data: {
          accessToken: access_token,
          refreshToken: refresh_token,
          tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
          connectedStatus: true,
        },
      })
    } else {
      console.log("Creating new integration...")
      integration = await prisma.integration.create({
        data: {
          userId,
          integrationType: "GOOGLE_SHEETS",
          accessToken: access_token,
          refreshToken: refresh_token,
          tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
          connectedStatus: true,
          updatedAt: new Date(),
        },
      })
    }

    console.log("Integration saved successfully")

    return new NextResponse(renderSuccessHtml(), {
      headers: { "Content-Type": "text/html" },
    })
  } catch (error: any) {
    console.error("Error processing request:", error.response?.data || error.message)
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

