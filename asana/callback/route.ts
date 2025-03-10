import { type NextRequest, NextResponse } from "next/server"
import axios from "axios"
import prisma from "@/lib/prisma"
import { stackServerApp } from "@/stack"
import { fetchAndStoreAsanaData } from "./asanaService"

export async function GET(req: NextRequest) {
  const user = await stackServerApp.getUser()
  if (!user) {
    console.error("Unauthorized: No user found")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = user.id
  const searchParams = req.nextUrl.searchParams
  const error = searchParams.get("error")
  const code = searchParams.get("code")
  const state = searchParams.get("state")

  console.log("Received OAuth Parameters:", { code, state })

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

  if (!code || !state) {
    console.error("Missing required parameters: code or state is null")
    return NextResponse.json({ message: "Missing required parameters" }, { status: 400 })
  }

  try {
    const tokenUrl = "https://app.asana.com/-/oauth_token"
    const redirectUri = process.env.ASANA_REDIRECT_URI
    const clientId = process.env.ASANA_CLIENT_ID
    const clientSecret = process.env.ASANA_CLIENT_SECRET

    console.log("Environment Variables Check:", {
      redirectUri,
      clientId,
      clientSecret: clientSecret ? "Exists" : "Missing",
    })

    if (!redirectUri || !clientId || !clientSecret) {
      throw new Error("Missing required environment variables")
    }

    // Exchange the authorization code for an access token
    const tokenResponse = await axios.post(
      tokenUrl,
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    )

    console.log("Token Response Data:", tokenResponse.data)

    const { access_token, refresh_token, expires_in } = tokenResponse.data

    // Store the token in the database
    let integration = await prisma.integration.findFirst({
      where: { userId, integrationType: "ASANA" },
    })

    if (integration) {
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
      integration = await prisma.integration.create({
        data: {
          userId,
          integrationType: "ASANA",
          accessToken: access_token,
          refreshToken: refresh_token,
          tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
          connectedStatus: true,
          updatedAt: new Date(),
        },
      })
    }

    // Fetch and store Asana data
    try {
      await fetchAndStoreAsanaData(userId, access_token)
      console.log("Successfully fetched and stored Asana data")
    } catch (error) {
      console.error("Error fetching Asana data:", error)
      // Continue the flow even if Asana data fetching fails
    }

    const successMessage = `<html><body><div>Asana connected successfully</div></body></html>`

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

