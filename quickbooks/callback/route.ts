import { type NextRequest, NextResponse } from "next/server"
import axios from "axios"
import prisma from "@/lib/prisma"
import { stackServerApp } from "@/stack"
import { fetchAndStoreQuickBooksFinancialData } from "./financialService"

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
  const realmId = searchParams.get("realmId")

  console.log("Received OAuth Parameters:", { authCode, state, realmId })

  if (error) {
    return NextResponse.json(
      { message: "Authorization Error", error, error_description: searchParams.get("error_description") },
      { status: 400 },
    )
  }

  if (!authCode || !state || !realmId) {
    return NextResponse.json({ message: "Missing required parameters" }, { status: 400 })
  }

  try {
    const tokenUrl = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
    const redirectUri = process.env.INTUIT_INTEGRATION_REDIRECT_URI
    const clientId = process.env.INTUIT_CLIENT_INTEGRATION_ID
    const clientSecret = process.env.INTUIT_CLIENT_INTEGRATION_SECRET

    if (!redirectUri || !clientId || !clientSecret) {
      throw new Error("Missing required environment variables")
    }

    const authHeader = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`

    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code: authCode,
      redirect_uri: redirectUri,
    })

    const tokenResponse = await axios.post(tokenUrl, params.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: authHeader,
      },
    })

    const { access_token, refresh_token, expires_in } = tokenResponse.data

    let integration = await prisma.integration.findFirst({
      where: { userId, integrationType: "QUICKBOOKS" },
    })

    if (integration) {
      integration = await prisma.integration.update({
        where: { id: integration.id },
        data: {
          accessToken: access_token,
          refreshToken: refresh_token,
          tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
          realmId,
          updatedAt: new Date(),
          connectedStatus: true, // Set connectedStatus to true
        },
      })
    } else {
      integration = await prisma.integration.create({
        data: {
          userId,
          integrationType: "QUICKBOOKS",
          accessToken: access_token,
          refreshToken: refresh_token,
          tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
          realmId,
          updatedAt: new Date(),
          connectedStatus: true, // Set connectedStatus to true
        },
      })
    }

    // Attempt to fetch and store financial data
    let fetchErrorMessage = null
    try {
      await fetchAndStoreQuickBooksFinancialData(userId, realmId, access_token)
    } catch (fetchError) {
      console.error("Error fetching financial data:", fetchError)
      fetchErrorMessage = "Error fetching financial data, but the connection was successful."
    }

    // Return a response with the fetch error message if there was one
    const successMessage = fetchErrorMessage
      ? `<html><body><div>QuickBooks connected successfully, but there was an error fetching financial data: ${fetchErrorMessage}</div></body></html>`
      : `<html><body><div>QuickBooks connected successfully</div></body></html>`

    return new NextResponse(successMessage, {
      headers: { "Content-Type": "text/html" },
    })
  } catch (error: any) {
    console.error("Error:", error.response?.data || error.message)
    return NextResponse.json({ message: "Error processing request", details: error.message }, { status: 500 })
  }
}

