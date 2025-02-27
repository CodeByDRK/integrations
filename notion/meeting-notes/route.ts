import { NextResponse } from "next/server"
import axios from "axios"
import { getNotionAccessToken } from "../utils"
import { stackServerApp } from "@/stack"

// POST: Sync meeting notes to Notion
export async function POST(req: Request) {
  try {
    const user = await stackServerApp.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const accessToken = await getNotionAccessToken(user.id)
    const body = await req.json()
    const { title, content, date, participants, parentPageId } = body

    if (!title || !content || !parentPageId) {
      return NextResponse.json({ error: "Title, content, and parent page ID are required" }, { status: 400 })
    }

    const pageData = {
      parent: { page_id: parentPageId },
      properties: {
        title: {
          title: [{ text: { content: title } }],
        },
        Date: {
          date: { start: date || new Date().toISOString().split("T")[0] },
        },
        Participants: {
          multi_select: participants.map((p: any) => ({ name: p })),
        },
      },
      children: [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content } }],
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

    return NextResponse.json({ success: true, meetingNotes: response.data })
  } catch (error: any) {
    console.error("Error syncing meeting notes to Notion:", error.response?.data || error.message)
    return NextResponse.json(
      { error: "Failed to sync meeting notes to Notion", details: error.response?.data || error.message },
      { status: 500 },
    )
  }
}

