import { type NextRequest, NextResponse } from "next/server"
import axios from "axios"
import prisma from "@/lib/prisma"
import { encrypt } from "../../utils/encryption"
import { stackServerApp } from "@/stack"
import { fetchAndStoreXeroFinancialData } from "./financialService"

export async function GET(req: NextRequest) {
  const user = await stackServerApp.getUser()
  if (!user) {
    console.error("Unauthorized: No user found")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = user.id
  const searchParams = req.nextUrl.searchParams
  const error = searchParams.get("error")
  const authCode = searchParams.get("code")
  const state = searchParams.get("state")

  console.log("Received OAuth Parameters:", { authCode, state })

  if (error) {
    console.error("OAuth Error:", error, searchParams.get("error_description"))
    return NextResponse.json(
      {
        message: "Authorization Error",
        error,
        error_description: searchParams.get("error_description"),
      },
      { status: 400 },
    )
  }

  if (!authCode || !state) {
    console.error("Missing required parameters: authCode or state is null")
    return NextResponse.json({ message: "Missing required parameters" }, { status: 400 })
  }

  try {
    const tokenUrl = "https://identity.xero.com/connect/token"
    const redirectUri = process.env.XERO_INTEGRATION_REDIRECT_URI
    const clientId = process.env.XERO_CLIENT_INTEGRATION_ID
    const clientSecret = process.env.XERO_CLIENT_INTEGRATION_SECRET

    console.log("Environment Variables Check:", {
      redirectUri,
      clientId,
      clientSecret: clientSecret ? "Exists" : "Missing",
    })

    if (!redirectUri || !clientId || !clientSecret) {
      throw new Error("Missing required environment variables")
    }

    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
    console.log("Authorization Header:", `Basic ${authHeader}`)

    console.log("Sending token request to Xero with:", {
      grant_type: "authorization_code",
      code: authCode,
      redirect_uri: redirectUri,
    })

    const tokenResponse = await axios.post(
      tokenUrl,
      new URLSearchParams({
        grant_type: "authorization_code",
        code: authCode,
        redirect_uri: redirectUri,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${authHeader}`,
        },
      },
    )

    console.log("Token Response Data:", tokenResponse.data)

    const { access_token, refresh_token, expires_in } = tokenResponse.data

    const tenantsResponse = await axios.get("https://api.xero.com/connections", {
      headers: { Authorization: `Bearer ${access_token}` },
    })

    console.log("Xero Tenants Response:", tenantsResponse.data)

    const tenants = tenantsResponse.data
    if (!tenants || tenants.length === 0) {
      throw new Error("No Xero tenants available")
    }

    const tenantId = tenants[0].tenantId

    let integration = await prisma.integration.findFirst({
      where: { userId, integrationType: "XERO" },
    })

    if (integration) {
      integration = await prisma.integration.update({
        where: { id: integration.id },
        data: {
          accessToken: encrypt(access_token),
          refreshToken: encrypt(refresh_token),
          tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
          tenantId,
          connectedStatus: true,
        },
      })
    } else {
      integration = await prisma.integration.create({
        data: {
          userId,
          integrationType: "XERO",
          accessToken: encrypt(access_token),
          refreshToken: encrypt(refresh_token),
          tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
          tenantId,
          connectedStatus: true,
          updatedAt: new Date(),
        },
      })
    }

    // Fetch and store financial data
    try {
      await fetchAndStoreXeroFinancialData(userId, access_token, tenantId)
      console.log("Successfully fetched and stored financial data")
    } catch (error) {
      console.error("Error fetching financial data:", error)
      // Continue with the flow even if financial data fetching fails
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
        <div>Xero connected</div>
        <script>setTimeout(() => window.close(), 5000);</script>
      </body>
    </html>
  `
}

