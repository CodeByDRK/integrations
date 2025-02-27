import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { stackServerApp } from "@/stack"

export async function GET() {
  try {
    console.log("Fetching Slack integration connection status...")
    const user = await stackServerApp.getUser()
    if (!user) {
      console.log("User not authenticated")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const userId = user.id
    console.log("User ID:", userId)

    console.log("Querying database for Slack integration status...")
    const integration = await prisma.integration.findFirst({
      where: {
        userId,
        integrationType: "SLACK",
      },
      select: {
        connectedStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!integration) {
      console.log("Slack integration not found for user")
      return NextResponse.json({ message: "Slack integration not found" }, { status: 404 })
    }

    console.log("Slack integration status found")

    return NextResponse.json({
      connectedStatus: integration.connectedStatus,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
    })
  } catch (error) {
    console.error("Error fetching Slack integration status:", error)
    return NextResponse.json({ message: "Internal Server Error", details: (error as Error).message }, { status: 500 })
  }
}

