import { NextResponse } from "next/server"
import axios from "axios"
import prisma from "@/lib/prisma"
import { stackServerApp } from "@/stack"
import { fetchAndStoreSalesforceData } from "./salesforceService"

export async function GET(req: Request) {
  const user = await stackServerApp.getUser()
  if (!user) {
    console.error("Unauthorized: No user found")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = user.id
  const url = new URL(req.url)
  const error = url.searchParams.get("error")
  const authCode = url.searchParams.get("code")
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

  if (!authCode || !state) {
    return NextResponse.json({ message: "Missing required parameters" }, { status: 400 })
  }

  try {
    const tokenUrl = "https://login.salesforce.com/services/oauth2/token"
    const redirectUri = process.env.SALESFORCE_REDIRECT_URI
    const clientId = process.env.SALESFORCE_INTEGRATION_CLIENT_ID
    const clientSecret = process.env.SALESFORCE_INTEGRATION_CLIENT_SECRET

    if (!redirectUri || !clientId || !clientSecret) {
      throw new Error("Missing required environment variables")
    }

    const tokenResponse = await axios.post(
      tokenUrl,
      new URLSearchParams({
        grant_type: "authorization_code",
        code: authCode,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    )

    const { access_token, refresh_token, instance_url } = tokenResponse.data

    let integration = await prisma.integration.findFirst({
      where: { userId, integrationType: "SALESFORCE" },
    })

    if (integration) {
      integration = await prisma.integration.update({
        where: { id: integration.id },
        data: {
          accessToken: access_token,
          refreshToken: refresh_token,
          instanceUrl: instance_url,
          connectedStatus: true,
        },
      })
    } else {
      integration = await prisma.integration.create({
        data: {
          userId,
          integrationType: "SALESFORCE",
          accessToken: access_token,
          refreshToken: refresh_token,
          instanceUrl: instance_url,
          connectedStatus: true,
          updatedAt: new Date(),
        },
      })
    }

    // Fetch and store Salesforce data
    try {
      await fetchAndStoreSalesforceData(userId, access_token, instance_url)
      console.log("Successfully fetched and stored Salesforce data")
    } catch (error) {
      console.error("Error fetching Salesforce data:", error)
      // Continue the flow even if Salesforce data fetching fails
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
        <div>Salesforce connected successfully</div>
        <script>setTimeout(() => window.close(), 5000);</script>
      </body>
    </html>
  `
}

