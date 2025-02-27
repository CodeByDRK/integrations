import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { stackServerApp } from "@/stack"

export async function GET() {
  try {
    const user = await stackServerApp.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const connectedIntegrations = await prisma.integration.findMany({
      where: {
        userId: user.id,
        connectedStatus: true,
      },
      select: {
        id: true,
        integrationType: true,
        // Add any other fields you need
      },
    })

    // Map the database results to your Integration type
    const integrations = connectedIntegrations.map((integration) => ({
      id: integration.integrationType.toLowerCase(),
      // Add other fields as necessary
      category: getCategoryForIntegrationType(integration.integrationType),
    }))

    return NextResponse.json({ integrations })
  } catch (error) {
    console.error("Error fetching connected integrations:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

function getCategoryForIntegrationType(integrationType: string): "finance" | "customer" | "operations" {
  // Define your mapping logic here
  const financeTypes = ["QUICKBOOKS", "XERO", "STRIPE"]
  const customerTypes = ["HUBSPOT", "SALESFORCE", "GOOGLE_ANALYTICS"]
  const operationsTypes = ["GOOGLE_SHEETS", "ASANA", "NOTION", "SLACK", "BASECAMP"]

  if (financeTypes.includes(integrationType)) return "finance"
  if (customerTypes.includes(integrationType)) return "customer"
  if (operationsTypes.includes(integrationType)) return "operations"
  return "operations" // Default category
}

