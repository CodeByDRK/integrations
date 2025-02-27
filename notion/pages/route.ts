import { NextResponse } from "next/server"
import axios from "axios"
import { getNotionAccessToken } from "../utils"
import { stackServerApp } from "@/stack"

// POST: Create a new page in Notion
export async function POST(req: Request) {
  try {
    const user = await stackServerApp.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const accessToken = await getNotionAccessToken(user.id)
    const body = await req.json()
    const { title, content, parentPageId } = body

    if (!title || !parentPageId) {
      return NextResponse.json({ error: "Title and parent page ID are required" }, { status: 400 })
    }

    const pageData = {
      parent: { page_id: parentPageId },
      properties: {
        title: {
          title: [{ text: { content: title } }],
        },
      },
      children: [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: content || "" } }],
          },
        },
      ],
    }

    const response = await axios.post("https://api.notion.com/v1/pages", pageData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
    })

    return NextResponse.json({ success: true, page: response.data })
  } catch (error: any) {
    console.error("Error creating Notion page:", error.response?.data || error.message)
    return NextResponse.json(
      { error: "Failed to create Notion page", details: error.response?.data || error.message },
      { status: 500 },
    )
  }
}

// PATCH: Update an existing page in Notion
export async function PATCH(req: Request) {
  try {
    const user = await stackServerApp.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const accessToken = await getNotionAccessToken(user.id)
    const body = await req.json()
    const { pageId, title, content } = body

    if (!pageId) {
      return NextResponse.json({ error: "Page ID is required" }, { status: 400 })
    }

    const updateData: any = {
      properties: {},
    }

    if (title) {
      updateData.properties.title = {
        title: [{ text: { content: title } }],
      }
    }

    if (content) {
      updateData.children = [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content } }],
          },
        },
      ]
    }

    const response = await axios.patch(`https://api.notion.com/v1/pages/${pageId}`, updateData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
    })

    return NextResponse.json({ success: true, page: response.data })
  } catch (error: any) {
    console.error("Error updating Notion page:", error.response?.data || error.message)
    return NextResponse.json(
      { error: "Failed to update Notion page", details: error.response?.data || error.message },
      { status: 500 },
    )
  }
}

// GET: Fetch pages from Notion
export async function GET(req: Request) {
  try {
    const user = await stackServerApp.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const accessToken = await getNotionAccessToken(user.id)
    const { searchParams } = new URL(req.url)
    const query = searchParams.get("query") || ""

    const response = await axios.post(
      "https://api.notion.com/v1/search",
      { query, filter: { property: "object", value: "page" } },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
      },
    )

    return NextResponse.json({ success: true, pages: response.data.results })
  } catch (error: any) {
    console.error("Error fetching Notion pages:", error.response?.data || error.message)
    return NextResponse.json(
      { error: "Failed to fetch Notion pages", details: error.response?.data || error.message },
      { status: 500 },
    )
  }
}

