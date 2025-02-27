import { NextResponse } from "next/server"
import axios from "axios"
import { getQuickBooksAccessToken, getQuickBooksApiUrl } from "../utils"
import { stackServerApp } from "@/stack"
import prisma from "@/lib/prisma"

// GET: Fetch recent invoices
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
      `${apiUrl}/query?query=select * from Invoice order by TxnDate DESC MAXRESULTS 20`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      },
    )

    return NextResponse.json({ success: true, invoices: response.data.QueryResponse.Invoice })
  } catch (error: any) {
    console.error("Error fetching QuickBooks invoices:", error.response?.data || error.message)
    return NextResponse.json(
      { error: "Failed to fetch QuickBooks invoices", details: error.response?.data || error.message },
      { status: 500 },
    )
  }
}

// POST: Create and send a new invoice
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
    const { customerId, items, dueDate } = body

    const invoiceData = {
      CustomerRef: { value: customerId },
      DueDate: dueDate,
      Line: items.map((item: any) => ({
        DetailType: "SalesItemLineDetail",
        Amount: item.amount,
        SalesItemLineDetail: {
          ItemRef: { value: item.itemId },
          Qty: item.quantity,
        },
      })),
    }

    const response = await axios.post(`${apiUrl}/invoice`, invoiceData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })

    // Send the invoice
    const invoiceId = response.data.Invoice.Id
    await axios.post(
      `${apiUrl}/invoice/${invoiceId}/send`,
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    )

    return NextResponse.json({ success: true, invoice: response.data.Invoice })
  } catch (error: any) {
    console.error("Error creating and sending QuickBooks invoice:", error.response?.data || error.message)
    return NextResponse.json(
      { error: "Failed to create and send QuickBooks invoice", details: error.response?.data || error.message },
      { status: 500 },
    )
  }
}

