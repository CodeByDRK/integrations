import { type NextRequest, NextResponse } from "next/server"
import axios from "axios"
import prisma from "@/lib/prisma"
import { stackServerApp } from "@/stack"
import { fetchAndStoreZohoData } from "./zohoService"

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
    const tokenUrl = "https://accounts.zoho.com/oauth/v2/token"
    const redirectUri = process.env.ZOHO_REDIRECT_URI
    const clientId = process.env.ZOHO_CLIENT_ID
    const clientSecret = process.env.ZOHO_CLIENT_SECRET

    console.log("Environment Variables Check:", {
      redirectUri,
      clientId,
      clientSecret: clientSecret ? "Exists" : "Missing",
    })

    if (!redirectUri || !clientId || !clientSecret) {
      throw new Error("Missing required environment variables")
    }

    console.log("Sending token request to Zoho with:", {
      grant_type: "authorization_code",
      code: authCode,
      redirect_uri: redirectUri,
      client_id: clientId,
    })

    const tokenResponse = await axios.post(
      tokenUrl,
      new URLSearchParams({
        grant_type: "authorization_code",
        code: authCode,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    )

    console.log("Token Response Data:", tokenResponse.data)

    const { access_token, refresh_token, expires_in } = tokenResponse.data

    // Get user info from Zoho
    const userInfoResponse = await axios.get("https://accounts.zoho.com/oauth/user/info", {
      headers: { Authorization: `Bearer ${access_token}` },
    })

    console.log("Zoho User Info Response:", userInfoResponse.data)

    const zohoUserId = userInfoResponse.data.ZUID || "unknown"

    let integration = await prisma.integration.findFirst({
      where: { userId, integrationType: "ZOHO" },
    })

    if (integration) {
      integration = await prisma.integration.update({
        where: { id: integration.id },
        data: {
          accessToken: access_token,
          refreshToken: refresh_token,
          tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
          tenantId: zohoUserId, // Using zohoUserId as tenantId for consistency
          connectedStatus: true,
          datatrails: {
            push: {
              event: "Zoho connected",
              timestamp: new Date().toISOString(),
              details: {
                zohoUserId,
                connectionStatus: "success",
              },
            },
          },
          updatedAt: new Date(),
        },
      })
    } else {
      integration = await prisma.integration.create({
        data: {
          userId,
          integrationType: "ZOHO",
          accessToken: access_token,
          refreshToken: refresh_token,
          tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
          tenantId: zohoUserId, // Using zohoUserId as tenantId for consistency
          connectedStatus: true,
          datatrails: [
            {
              event: "Zoho connected",
              timestamp: new Date().toISOString(),
              details: {
                zohoUserId,
                connectionStatus: "success",
              },
            },
          ],
          updatedAt: new Date(),
        },
      })
    }

    // Attempt to fetch and store Zoho data
    let fetchErrorMessage = null
    try {
      await fetchAndStoreZohoData(userId, access_token)
      console.log("Successfully fetched and stored Zoho data")
    } catch (fetchError) {
      console.error("Error fetching Zoho data:", fetchError)
      fetchErrorMessage = "Error fetching Zoho data, but the connection was successful."
    }

    // Return a response with the fetch error message if there was one
    const successMessage = fetchErrorMessage
      ? `<html><body><div>Zoho connected successfully, but there was an error fetching data: ${fetchErrorMessage}</div></body></html>`
      : `<html><body><div>Zoho connected successfully</div></body></html>`

    return new NextResponse(successMessage, {
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

