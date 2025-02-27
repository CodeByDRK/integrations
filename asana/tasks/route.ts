import { NextResponse } from "next/server"
import axios from "axios"
import prisma from "@/lib/prisma"
import { decrypt, encrypt } from "../../utils/encryption"
import { stackServerApp } from "@/stack"

// GET: Fetch Asana users from the workspace
export async function GET(req: Request) {
  try {
    const user = await stackServerApp.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = user.id

    // Get the integration from the database
    const integration = await prisma.integration.findFirst({
      where: { userId, integrationType: "ASANA" },
    })

    if (!integration || !integration.connectedStatus) {
      return NextResponse.json({ error: "Asana integration not found or not connected" }, { status: 404 })
    }

    // Decrypt the access token
    const accessToken = decrypt(integration.accessToken!)
    const workspaceId = integration.workSpaceId

    // Check if token is expired and refresh if needed
    if (integration.tokenExpiresAt && new Date(integration.tokenExpiresAt) < new Date()) {
      const newTokens = await refreshAsanaToken(integration.refreshToken!, userId)
      if (!newTokens) {
        return NextResponse.json({ error: "Failed to refresh token" }, { status: 401 })
      }
    }

    // Fetch users from the workspace
    const usersResponse = await axios.get(`https://app.asana.com/api/1.0/workspaces/${workspaceId}/users`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    return NextResponse.json({ users: usersResponse.data.data })
  } catch (error: any) {
    console.error("Error fetching Asana users:", error.response?.data || error.message)
    return NextResponse.json(
      { error: "Failed to fetch Asana users", details: error.response?.data || error.message },
      { status: 500 },
    )
  }
}

// POST: Create a new task in Asana
export async function POST(req: Request) {
  try {
    const user = await stackServerApp.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = user.id
    const body = await req.json()
    const { name, notes, assigneeId, dueOn, projectId } = body

    if (!name) {
      return NextResponse.json({ error: "Task name is required" }, { status: 400 })
    }

    // Get the integration from the database
    const integration = await prisma.integration.findFirst({
      where: { userId, integrationType: "ASANA" },
    })

    if (!integration || !integration.connectedStatus) {
      return NextResponse.json({ error: "Asana integration not found or not connected" }, { status: 404 })
    }

    // Decrypt the access token
    const accessToken = decrypt(integration.accessToken!)
    const workspaceId = integration.workSpaceId

    // Check if token is expired and refresh if needed
    if (integration.tokenExpiresAt && new Date(integration.tokenExpiresAt) < new Date()) {
      const newTokens = await refreshAsanaToken(integration.refreshToken!, userId)
      if (!newTokens) {
        return NextResponse.json({ error: "Failed to refresh token" }, { status: 401 })
      }
    }

    // Create the task in Asana
    const taskData: any = {
      name,
      workspace: workspaceId,
      notes,
    }

    if (assigneeId) taskData.assignee = assigneeId
    if (dueOn) taskData.due_on = dueOn
    if (projectId) taskData.projects = [projectId]

    const taskResponse = await axios.post(
      "https://app.asana.com/api/1.0/tasks",
      { data: taskData },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    )

    return NextResponse.json({ success: true, task: taskResponse.data.data })
  } catch (error: any) {
    console.error("Error creating Asana task:", error.response?.data || error.message)
    return NextResponse.json(
      { error: "Failed to create Asana task", details: error.response?.data || error.message },
      { status: 500 },
    )
  }
}

// Helper function to refresh the Asana token
async function refreshAsanaToken(refreshToken: string, userId: string) {
  try {
    const decryptedRefreshToken = decrypt(refreshToken)
    const clientId = process.env.ASANA_INTEGRATION_CLIENT_ID
    const clientSecret = process.env.ASANA_INTEGRATION_CLIENT_SECRET

    const tokenResponse = await axios.post(
      "https://app.asana.com/-/oauth_token",
      {
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: decryptedRefreshToken,
      },
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    )

    const { access_token, refresh_token, expires_in } = tokenResponse.data

    // Find the integration first
    const integration = await prisma.integration.findFirst({
      where: {
        userId: userId,
        integrationType: "ASANA",
      },
    })

    if (!integration) {
      throw new Error("Integration not found")
    }

    // Update the tokens in the database
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
    console.error("Error refreshing Asana token:", error)
    return null
  }
}

