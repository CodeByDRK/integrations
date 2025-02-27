import { NextResponse } from "next/server"
import axios from "axios"
import { getQuickBooksAccessToken, getQuickBooksApiUrl } from "../utils"
import { stackServerApp } from "@/stack"
import prisma from "@/lib/prisma"

// GET: Fetch account balances
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
    const response = await axios.get(`${apiUrl}/query?query=select * from Account where AccountType='Bank'`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    })

    return NextResponse.json({ success: true, accounts: response.data.QueryResponse.Account })
  } catch (error: any) {
    console.error("Error fetching QuickBooks account balances:", error.response?.data || error.message)
    return NextResponse.json(
      { error: "Failed to fetch QuickBooks account balances", details: error.response?.data || error.message },
      { status: 500 },
    )
  }
}

