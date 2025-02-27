import { NextResponse } from "next/server"
import axios from "axios"
import { getQuickBooksAccessToken, getQuickBooksApiUrl } from "../utils"
import { stackServerApp } from "@/stack"
import prisma from "@/lib/prisma"

// GET: Fetch customers
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
    const response = await axios.get(`${apiUrl}/query?query=select * from Customer MAXRESULTS 1000`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    })

    return NextResponse.json({ success: true, customers: response.data.QueryResponse.Customer })
  } catch (error: any) {
    console.error("Error fetching QuickBooks customers:", error.response?.data || error.message)
    return NextResponse.json(
      { error: "Failed to fetch QuickBooks customers", details: error.response?.data || error.message },
      { status: 500 },
    )
  }
}

// POST: Create or update a customer
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
    const { id, displayName, firstName, lastName, email, phone } = body

    const customerData = {
      DisplayName: displayName,
      GivenName: firstName,
      FamilyName: lastName,
      PrimaryEmailAddr: { Address: email },
      PrimaryPhone: { FreeFormNumber: phone },
    }

    let response
    if (id) {
      // Update existing customer
      response = await axios.post(
        `${apiUrl}/customer`,
        { ...customerData, Id: id, sparse: true },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        },
      )
    } else {
      // Create new customer
      response = await axios.post(`${apiUrl}/customer`, customerData, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      })
    }

    return NextResponse.json({ success: true, customer: response.data.Customer })
  } catch (error: any) {
    console.error("Error creating/updating QuickBooks customer:", error.response?.data || error.message)
    return NextResponse.json(
      { error: "Failed to create/update QuickBooks customer", details: error.response?.data || error.message },
      { status: 500 },
    )
  }
}

