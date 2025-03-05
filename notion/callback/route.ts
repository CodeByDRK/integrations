import { type NextRequest, NextResponse } from "next/server"
import axios from "axios"
import prisma from "@/lib/prisma"
import { stackServerApp } from "@/stack"
import { fetchAndStoreNotionData } from "./notionService"

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
    const tokenUrl = "https://api.notion.com/v1/oauth/token"
    const redirectUri = process.env.NOTION_INTEGRATION_REDIRECT_URI
    const clientId = process.env.NOTION_INTEGRATION_CLIENT_ID
    const clientSecret = process.env.NOTION_INTEGRATION_CLIENT_SECRET

    console.log("Environment Variables Check:", {
      redirectUri,
      clientId,
      clientSecret: clientSecret ? "Exists" : "Missing",
    })

    if (!redirectUri || !clientId || !clientSecret) {
      throw new Error("Missing required environment variables")
    }

    console.log("Sending token request to Notion")

    const tokenResponse = await axios.post(
      tokenUrl,
      {
        grant_type: "authorization_code",
        code: authCode,
        redirect_uri: redirectUri,
      },
      {
        auth: {
          username: clientId,
          password: clientSecret,
        },
        headers: {
          "Content-Type": "application/json",
        },
      },
    )

    console.log("Token Response Data:", tokenResponse.data)

    const { access_token, refresh_token, workspace_id, expires_in } = tokenResponse.data

    // Fetch Notion workspace data to get pageId, blockId, and databaseId
    let workspaceData
    try {
      workspaceData = await fetchNotionWorkspaceData(access_token)
    } catch (error) {
      console.error("Error fetching Notion workspace data:", error)
      workspaceData = { pageId: null, blockId: null, databaseId: null }
    }

    // Calculate token expiration time
    let tokenExpiresAt = null
    if (expires_in && !isNaN(expires_in)) {
      tokenExpiresAt = new Date(Date.now() + expires_in * 1000)
    }

    let integration = await prisma.integration.findFirst({
      where: { userId, integrationType: "NOTION" },
    })

    if (integration) {
      integration = await prisma.integration.update({
        where: { id: integration.id },
        data: {
          accessToken: access_token,
          refreshToken: refresh_token ? refresh_token : null,
          tokenExpiresAt,
          workSpaceId: workspace_id,
          pageId: workspaceData.pageId,
          blockId: workspaceData.blockId,
          databaseId: workspaceData.databaseId,
          connectedStatus: true,
        },
      })
    } else {
      integration = await prisma.integration.create({
        data: {
          userId,
          integrationType: "NOTION",
          accessToken: access_token,
          refreshToken: refresh_token ? refresh_token : null,
          tokenExpiresAt,
          workSpaceId: workspace_id,
          pageId: workspaceData.pageId,
          blockId: workspaceData.blockId,
          databaseId: workspaceData.databaseId,
          connectedStatus: true,
          updatedAt: new Date(),
        },
      })
    }

    // Fetch and store Notion data
    try {
      await fetchAndStoreNotionData(userId, access_token)
      console.log("Successfully fetched and stored Notion data")
    } catch (error) {
      console.error("Error fetching Notion data:", error)
      // Continue with the flow even if Notion data fetching fails
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

async function fetchNotionWorkspaceData(accessToken: string) {
  try {
    // Fetch the user's information
    const userResponse = await axios.get("https://api.notion.com/v1/users/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Notion-Version": "2022-06-28",
      },
    })

    console.log("User data:", userResponse.data)

    // Fetch the most recently edited pages
    const pagesResponse = await axios.post(
      "https://api.notion.com/v1/search",
      {
        filter: {
          property: "object",
          value: "page",
        },
        sort: {
          direction: "descending",
          timestamp: "last_edited_time",
        },
        page_size: 1,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
      },
    )

    console.log("Pages data:", pagesResponse.data)

    // Fetch the most recently edited databases
    const databasesResponse = await axios.post(
      "https://api.notion.com/v1/search",
      {
        filter: {
          property: "object",
          value: "database",
        },
        sort: {
          direction: "descending",
          timestamp: "last_edited_time",
        },
        page_size: 1,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
      },
    )

    console.log("Databases data:", databasesResponse.data)

    const pageId = pagesResponse.data.results[0]?.id || null
    const blockId = pageId // In Notion, the page ID is also used as the root block ID
    const databaseId = databasesResponse.data.results[0]?.id || null

    return { pageId, blockId, databaseId }
  } catch (error) {
    console.error("Error fetching Notion workspace data:", error)
    throw error
  }
}

function renderSuccessHtml() {
  return `
    <html>
      <body>
        <div>Notion connected successfully</div>
        <script>setTimeout(() => window.close(), 5000);</script>
      </body>
    </html>
  `;
}
