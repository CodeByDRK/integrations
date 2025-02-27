import { NextResponse } from "next/server"
import axios from "axios"
import { getQuickBooksAccessToken, getQuickBooksApiUrl } from "../utils"
import { stackServerApp } from "@/stack"
import prisma from "@/lib/prisma"

// GET: Fetch recent payments
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
    const response = await axios.get(
      `${apiUrl}/query?query=select * from Payment order by TxnDate DESC MAXRESULTS 20`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      },
    )

    return NextResponse.json({ success: true, payments: response.data.QueryResponse.Payment })
  } catch (error: any) {
    console.error("Error fetching QuickBooks payments:", error.response?.data || error.message)
    return NextResponse.json(
      { error: "Failed to fetch QuickBooks payments", details: error.response?.data || error.message },
      { status: 500 },
    )
  }
}

// POST: Record a new payment
export async function POST(req: Request) {
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
    const body = await req.json()
    const { customerId, amount, paymentMethod, date } = body

    const paymentData = {
      CustomerRef: { value: customerId },
      TotalAmt: amount,
      PaymentMethodRef: { value: paymentMethod },
      TxnDate: date,
    }

    const response = await axios.post(`${apiUrl}/payment`, paymentData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })

    return NextResponse.json({ success: true, payment: response.data.Payment })
  } catch (error: any) {
    console.error("Error recording QuickBooks payment:", error.response?.data || error.message)
    return NextResponse.json(
      { error: "Failed to record QuickBooks payment", details: error.response?.data || error.message },
      { status: 500 },
    )
  }
}

