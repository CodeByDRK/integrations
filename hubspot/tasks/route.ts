import { NextResponse } from "next/server"
import axios from "axios"
import { getHubSpotAccessToken } from "../utils"
import { stackServerApp } from "@/stack"

// POST: Create a task in HubSpot
export async function POST(req: Request) {
  try {
    const user = await stackServerApp.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const accessToken = await getHubSpotAccessToken(user.id)
    const body = await req.json()
    const { title, description, dueDate, reminderTime, associatedObjectType, associatedObjectId } = body

    if (!title || !dueDate) {
      return NextResponse.json({ error: "Title and due date are required" }, { status: 400 })
    }

    const taskData: any = {
      properties: {
        hs_task_subject: title,
        hs_task_body: description,
        hs_task_status: "NOT_STARTED",
        hs_task_priority: "MEDIUM",
        hs_timestamp: new Date(dueDate).getTime(),
      },
    }

    if (reminderTime) {
      taskData.properties.hs_timestamp_earliest_reminder_allowed = new Date(reminderTime).getTime()
    }

    if (associatedObjectType && associatedObjectId) {
      taskData.associations = [
        {
          to: { id: associatedObjectId },
          types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 1 }],
        },
      ]
    }

    const taskResponse = await axios.post("https://api.hubapi.com/crm/v3/objects/tasks", taskData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    })

    return NextResponse.json({ success: true, task: taskResponse.data })
  } catch (error: any) {
    console.error("Error creating HubSpot task:", error.response?.data || error.message)
    return NextResponse.json(
      { error: "Failed to create HubSpot task", details: error.response?.data || error.message },
      { status: 500 },
    )
  }
}

// GET: Fetch HubSpot tasks
export async function GET(req: Request) {
  try {
    const user = await stackServerApp.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const accessToken = await getHubSpotAccessToken(user.id)
    const { searchParams } = new URL(req.url)
    const limit = searchParams.get("limit") || "20"

    const tasksResponse = await axios.get(`https://api.hubapi.com/crm/v3/objects/tasks?limit=${limit}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    return NextResponse.json({ success: true, tasks: tasksResponse.data.results })
  } catch (error: any) {
    console.error("Error fetching HubSpot tasks:", error.response?.data || error.message)
    return NextResponse.json(
      { error: "Failed to fetch HubSpot tasks", details: error.response?.data || error.message },
      { status: 500 },
    )
  }
}

