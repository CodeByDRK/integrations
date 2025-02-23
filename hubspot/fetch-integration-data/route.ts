import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { stackServerApp } from "@/stack"

export async function GET() {
  try {
    console.log("Fetching HubSpot integration data...")
    const user = await stackServerApp.getUser()
    if (!user) {
      console.log("User not authenticated")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const userId = user.id
    console.log("User ID:", userId)

    console.log("Querying database for HubSpot integration...")
    const integration = await prisma.integration.findFirst({
      where: {
        userId,
        integrationType: "HUBSPOT",
      },
      select: {
        integrationData: true,
        connectedStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!integration) {
      console.log("HubSpot integration not found for user")
      return NextResponse.json({ message: "HubSpot integration not found" }, { status: 404 })
    }

    console.log("HubSpot integration found, parsing data...")
    console.log("Raw integrationData:", integration.integrationData)

    return NextResponse.json({
      integration: {
        integrationData: integration.integrationData,
        connectedStatus: integration.connectedStatus,
        createdAt: integration.createdAt,
        updatedAt: integration.updatedAt,
      },
    })
  } catch (error) {
    console.error("Error fetching HubSpot integration data:", error)
    return NextResponse.json({ message: "Internal Server Error", details: (error as Error).message }, { status: 500 })
  }
}

