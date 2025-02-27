import { NextResponse } from "next/server"
import axios from "axios"
import { getNotionAccessToken } from "../utils"
import { stackServerApp } from "@/stack"

// POST: Add a user to a Notion workspace
export async function POST(req: Request) {
  try {
    const user = await stackServerApp.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const accessToken = await getNotionAccessToken(user.id)
    const body = await req.json()
    const { email, role } = body

    if (!email || !role) {
      return NextResponse.json({ error: "Email and role are required" }, { status: 400 })
    }

    const response = await axios.post(
      "https://api.notion.com/v1/users",
      { email, role },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
      },
    )

    return NextResponse.json({ success: true, user: response.data })
  } catch (error: any) {
    console.error("Error adding user to Notion workspace:", error.response?.data || error.message)
    return NextResponse.json(
      { error: "Failed to add user to Notion workspace", details: error.response?.data || error.message },
      { status: 500 },
    )
  }
}

// GET: Fetch users from a Notion workspace
export async function GET(req: Request) {
  try {
    const user = await stackServerApp.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const accessToken = await getNotionAccessToken(user.id)

    const response = await axios.get("https://api.notion.com/v1/users", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Notion-Version": "2022-06-28",
      },
    })

    return NextResponse.json({ success: true, users: response.data.results })
  } catch (error: any) {
    console.error("Error fetching Notion users:", error.response?.data || error.message)
    return NextResponse.json(
      { error: "Failed to fetch Notion users", details: error.response?.data || error.message },
      { status: 500 },
    )
  }
}

