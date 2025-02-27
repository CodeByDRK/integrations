import { NextResponse } from "next/server"
import axios from "axios"
import { getHubSpotAccessToken } from "../utils"
import { stackServerApp } from "@/stack"

// POST: Send an email using HubSpot
export async function POST(req: Request) {
  try {
    const user = await stackServerApp.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const accessToken = await getHubSpotAccessToken(user.id)
    const body = await req.json()
    const { from, to, subject, message } = body

    if (!from || !to || !subject || !message) {
      return NextResponse.json({ error: "From, to, subject, and message are required" }, { status: 400 })
    }

    const emailData = {
      from,
      to,
      subject,
      message,
    }

    // Note: This is using the Single Send Emails API. You might need to adjust based on your specific HubSpot plan and requirements.
    const emailResponse = await axios.post(
      "https://api.hubapi.com/marketing/v3/transactional/single-email/send",
      emailData,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    )

    return NextResponse.json({ success: true, emailStatus: emailResponse.data })
  } catch (error: any) {
    console.error("Error sending email via HubSpot:", error.response?.data || error.message)
    return NextResponse.json(
      { error: "Failed to send email via HubSpot", details: error.response?.data || error.message },
      { status: 500 },
    )
  }
}

// GET: Get email tracking data
export async function GET(req: Request) {
  try {
    const user = await stackServerApp.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const accessToken = await getHubSpotAccessToken(user.id)
    const { searchParams } = new URL(req.url)
    const limit = searchParams.get("limit") || "20"

    const trackingResponse = await axios.get(`https://api.hubapi.com/email/public/v1/events?limit=${limit}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    return NextResponse.json({ success: true, trackingData: trackingResponse.data })
  } catch (error: any) {
    console.error("Error fetching email tracking data from HubSpot:", error.response?.data || error.message)
    return NextResponse.json(
      { error: "Failed to fetch email tracking data from HubSpot", details: error.response?.data || error.message },
      { status: 500 },
    )
  }
}

