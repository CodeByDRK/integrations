import { NextResponse } from "next/server"
import axios from "axios"
import { getHubSpotAccessToken } from "../utils"
import { stackServerApp } from "@/stack"

// GET: Fetch HubSpot contacts
export async function GET(req: Request) {
  try {
    const user = await stackServerApp.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const accessToken = await getHubSpotAccessToken(user.id)

    const contactsResponse = await axios.get("https://api.hubapi.com/crm/v3/objects/contacts", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    return NextResponse.json({ contacts: contactsResponse.data.results })
  } catch (error: any) {
    console.error("Error fetching HubSpot contacts:", error.response?.data || error.message)
    return NextResponse.json(
      { error: "Failed to fetch HubSpot contacts", details: error.response?.data || error.message },
      { status: 500 },
    )
  }
}

// POST: Create or update a HubSpot contact
export async function POST(req: Request) {
  try {
    const user = await stackServerApp.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const accessToken = await getHubSpotAccessToken(user.id)
    const body = await req.json()
    const { email, firstName, lastName, phone } = body

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    const contactData = {
      properties: {
        email,
        firstname: firstName,
        lastname: lastName,
        phone,
      },
    }

    const contactResponse = await axios.post("https://api.hubapi.com/crm/v3/objects/contacts", contactData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })

    return NextResponse.json({ success: true, contact: contactResponse.data })
  } catch (error: any) {
    console.error("Error creating/updating HubSpot contact:", error.response?.data || error.message)
    return NextResponse.json(
      { error: "Failed to create/update HubSpot contact", details: error.response?.data || error.message },
      { status: 500 },
    )
  }
}

