import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { stackServerApp } from "@/stack"

export async function GET(req: NextRequest) {
  const user = await stackServerApp.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const userId = user.id

  try {
    const integration = await prisma.integration.findFirst({
      where: {
        userId,
        integrationType: "QUICKBOOKS",
      },
      select: {
        integrationData: true,
        connectedStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!integration) {
      return NextResponse.json({ message: "QuickBooks integration not found" }, { status: 404 })
    }

    return NextResponse.json({
      integration: {
        integrationData: integration.integrationData,
        connectedStatus: integration.connectedStatus,
        createdAt: integration.createdAt,
        updatedAt: integration.updatedAt,
      },
    })
  } catch (error: any) {
    console.error("Error fetching QuickBooks integration data:", error)
    return NextResponse.json(
      {
        message: `Internal Server Error: ${error.message}`,
      },
      { status: 500 },
    )
  }
}

