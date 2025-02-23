import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { stackServerApp } from "@/stack"

interface FinancialData {
  month: string
  revenue: string
  burnRate: string
  runway: string
  fundraising: string
}

export async function GET() {
  try {
    console.log("Fetching Xero integration data...")
    const user = await stackServerApp.getUser()
    if (!user) {
      console.log("User not authenticated")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const userId = user.id
    console.log("User ID:", userId)

    console.log("Querying database for Xero integration...")
    const integration = await prisma.integration.findFirst({
      where: {
        userId,
        integrationType: "XERO",
      },
      select: {
        integrationData: true,
        connectedStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    if (!integration) {
      console.log("Xero integration not found for user")
      return NextResponse.json({ message: "Xero integration not found" }, { status: 404 })
    }

    console.log("Xero integration found, parsing data...")
    console.log("Raw integrationData:", integration.integrationData)

    let financialData: FinancialData[]

    if (typeof integration.integrationData === "string") {
      try {
        financialData = JSON.parse(integration.integrationData) as FinancialData[]
      } catch (parseError) {
        console.error("Error parsing integrationData:", parseError)
        return NextResponse.json({ message: "Invalid integration data format: parsing error" }, { status: 500 })
      }
    } else if (Array.isArray(integration.integrationData)) {
      financialData = integration.integrationData as unknown as FinancialData[]
    } else {
      console.error("Unexpected integrationData format:", typeof integration.integrationData)
      return NextResponse.json({ message: "Invalid integration data format: unexpected type" }, { status: 500 })
    }

    if (!Array.isArray(financialData) || financialData.length === 0) {
      console.error("Invalid or empty financialData:", financialData)
      return NextResponse.json({ message: "Invalid integration data format: empty or not an array" }, { status: 500 })
    }

    console.log("Financial data parsed successfully")
    console.log("Financial data from database:", financialData)

    return NextResponse.json({
      integration: {
        integrationData: financialData,
        connectedStatus: integration.connectedStatus,
        createdAt: integration.createdAt,
        updatedAt: integration.updatedAt,
      },
    })
  } catch (error) {
    console.error("Error fetching Xero integration data:", error)
    return NextResponse.json({ message: "Internal Server Error", details: (error as Error).message }, { status: 500 })
  }
}

