import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { stackServerApp } from "@/stack"

export async function GET() {
  try {
    const user = await stackServerApp.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const userId = user.id

    const integration = await prisma.integration.findFirst({
      where: {
        userId,
        integrationType: "SALESFORCE",
      },
      select: {
        integrationData: true,
        connectedStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!integration) {
      return NextResponse.json({ message: "Salesforce integration not found" }, { status: 404 })
    }

    return NextResponse.json({
      integration: {
        integrationData: integration.integrationData,
        connectedStatus: integration.connectedStatus,
        createdAt: integration.createdAt,
        updatedAt: integration.updatedAt,
      },
    })
  } catch (error) {
    console.error("Error fetching Salesforce integration data:", error)
    return NextResponse.json({ message: "Internal Server Error", details: (error as Error).message }, { status: 500 })
  }
}

