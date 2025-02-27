import { NextResponse } from "next/server"
import axios from "axios"
import { getNotionAccessToken } from "../utils"
import { stackServerApp } from "@/stack"

interface TaskProperties {
  Name: {
    title: { text: { content: string } }[]
  }
  Status: {
    select: { name: string }
  }
  "Due Date"?: {
    date: { start: string }
  }
  Assignee?: {
    people: { id: string }[]
  }
}

interface TaskData {
  parent: { database_id: string }
  properties: TaskProperties
}

// POST: Create a new task in Notion
export async function POST(req: Request) {
  try {
    const user = await stackServerApp.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const accessToken = await getNotionAccessToken(user.id)
    const body = await req.json()
    const { title, status, dueDate, assignee, databaseId } = body

    if (!title || !databaseId) {
      return NextResponse.json({ error: "Title and database ID are required" }, { status: 400 })
    }

    const taskData: TaskData = {
      parent: { database_id: databaseId },
      properties: {
        Name: {
          title: [{ text: { content: title } }],
        },
        Status: {
          select: { name: status || "Not Started" },
        },
      },
    }

    if (dueDate) {
      taskData.properties["Due Date"] = {
        date: { start: dueDate },
      }
    }

    if (assignee) {
      taskData.properties["Assignee"] = {
        people: [{ id: assignee }],
      }
    }

    const response = await axios.post("https://api.notion.com/v1/pages", taskData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
    })

    return NextResponse.json({ success: true, task: response.data })
  } catch (error: any) {
    console.error("Error creating Notion task:", error.response?.data || error.message)
    return NextResponse.json(
      { error: "Failed to create Notion task", details: error.response?.data || error.message },
      { status: 500 },
    )
  }
}

// PATCH: Update an existing task in Notion
export async function PATCH(req: Request) {
  try {
    const user = await stackServerApp.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const accessToken = await getNotionAccessToken(user.id)
    const body = await req.json()
    const { pageId, title, status, dueDate, assignee } = body

    if (!pageId) {
      return NextResponse.json({ error: "Page ID is required" }, { status: 400 })
    }

    const updateData: { properties: Partial<TaskProperties> } = {
      properties: {},
    }

    if (title) {
      updateData.properties.Name = {
        title: [{ text: { content: title } }],
      }
    }

    if (status) {
      updateData.properties.Status = {
        select: { name: status },
      }
    }

    if (dueDate) {
      updateData.properties["Due Date"] = {
        date: { start: dueDate },
      }
    }

    if (assignee) {
      updateData.properties.Assignee = {
        people: [{ id: assignee }],
      }
    }

    const response = await axios.patch(`https://api.notion.com/v1/pages/${pageId}`, updateData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
    })

    return NextResponse.json({ success: true, task: response.data })
  } catch (error: any) {
    console.error("Error updating Notion task:", error.response?.data || error.message)
    return NextResponse.json(
      { error: "Failed to update Notion task", details: error.response?.data || error.message },
      { status: 500 },
    )
  }
}

// GET: Fetch tasks from a Notion database
export async function GET(req: Request) {
  try {
    const user = await stackServerApp.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const accessToken = await getNotionAccessToken(user.id)
    const { searchParams } = new URL(req.url)
    const databaseId = searchParams.get("databaseId")

    if (!databaseId) {
      return NextResponse.json({ error: "Database ID is required" }, { status: 400 })
    }

    const response = await axios.post(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
      },
    )

    return NextResponse.json({ success: true, tasks: response.data.results })
  } catch (error: any) {
    console.error("Error fetching Notion tasks:", error.response?.data || error.message)
    return NextResponse.json(
      { error: "Failed to fetch Notion tasks", details: error.response?.data || error.message },
      { status: 500 },
    )
  }
}

