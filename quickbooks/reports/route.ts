import { NextResponse } from "next/server"
import axios from "axios"
import { getQuickBooksAccessToken, getQuickBooksApiUrl } from "../utils"
import { stackServerApp } from "@/stack"
import prisma from "@/lib/prisma"

// GET: Generate a report
export async function GET(req: Request) {
  try {
    const user = await stackServerApp.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const accessToken = await getQuickBooksAccessToken(user.id)
    const integration = await prisma.integration.findFirst({
      where: { userId: user.id, integrationType: "QUICKBOOKS" },
    })

    if (!integration || !integration.realmId) {
      return NextResponse.json({ error: "QuickBooks realm ID not found" }, { status: 400 })
    }

    const apiUrl = getQuickBooksApiUrl(integration.realmId)
    const { searchParams } = new URL(req.url)
    const reportType = searchParams.get("type") || "ProfitAndLoss"
    const startDate = searchParams.get("startDate") || "2023-01-01"
    const endDate = searchParams.get("endDate") || "2023-12-31"

    const response = await axios.get(`${apiUrl}/reports/${reportType}?start_date=${startDate}&end_date=${endDate}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    })

    return NextResponse.json({ success: true, report: response.data })
  } catch (error: any) {
    console.error("Error generating QuickBooks report:", error.response?.data || error.message)
    return NextResponse.json(
      { error: "Failed to generate QuickBooks report", details: error.response?.data || error.message },
      { status: 500 },
    )
  }
}

