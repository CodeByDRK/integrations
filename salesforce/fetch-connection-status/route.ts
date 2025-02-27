import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { stackServerApp } from "@/stack"

export async function GET() {
  try {
    console.log("Fetching Salesforce integration connection status...")
    const user = await stackServerApp.getUser()
    if (!user) {
      console.log("User not authenticated")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const userId = user.id
    console.log("User ID:", userId)

    console.log("Querying database for Salesforce integration status...")
    const integration = await prisma.integration.findFirst({
      where: {
        userId,
        integrationType: "SALESFORCE",
      },
      select: {
        connectedStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!integration) {
      console.log("Salesforce integration not found for user")
      return NextResponse.json({ message: "Salesforce integration not found" }, { status: 404 })
    }

    console.log("Salesforce integration status found")

    return NextResponse.json({
      connectedStatus: integration.connectedStatus,
      createdAt: integration.createdAt,
      updatedAt: integration.updatedAt,
    })
  } catch (error) {
    console.error("Error fetching Salesforce integration status:", error)
    return NextResponse.json({ message: "Internal Server Error", details: (error as Error).message }, { status: 500 })
  }
}

