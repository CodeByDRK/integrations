import axios from "axios"
import prisma from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

interface AsanaMetrics {
  workspaceCount: number
  projectCount: number
  taskCount: number
  completedTaskCount: number
}

export async function fetchAndStoreAsanaData(userId: string, accessToken: string): Promise<void> {
  try {
    console.log("Fetching data from Asana API...")

    const currentDate = new Date()
    const thirtyDaysAgo = new Date(currentDate.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Initialize the Asana metrics structure
    const asanaMetrics: AsanaMetrics = {
      workspaceCount: 0,
      projectCount: 0,
      taskCount: 0,
      completedTaskCount: 0,
    }

    // Fetch workspaces
    const workspacesResponse = await axios.get("https://app.asana.com/api/1.0/workspaces", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (workspacesResponse.data && workspacesResponse.data.data) {
      asanaMetrics.workspaceCount = workspacesResponse.data.data.length

      // If there are workspaces, fetch projects for the first workspace
      if (asanaMetrics.workspaceCount > 0) {
        const workspaceId = workspacesResponse.data.data[0].gid

        // Fetch projects
        const projectsResponse = await axios.get(`https://app.asana.com/api/1.0/workspaces/${workspaceId}/projects`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })

        if (projectsResponse.data && projectsResponse.data.data) {
          asanaMetrics.projectCount = projectsResponse.data.data.length

          // Fetch tasks for each project (limited to first 5 projects to avoid rate limits)
          const projectsToFetch = projectsResponse.data.data.slice(0, 5)

          for (const project of projectsToFetch) {
            const tasksResponse = await axios.get(`https://app.asana.com/api/1.0/projects/${project.gid}/tasks`, {
              headers: { Authorization: `Bearer ${accessToken}` },
              params: {
                completed_since: thirtyDaysAgo.toISOString(),
              },
            })

            if (tasksResponse.data && tasksResponse.data.data) {
              asanaMetrics.taskCount += tasksResponse.data.data.length

              // Count completed tasks
              for (const task of tasksResponse.data.data) {
                const taskDetailsResponse = await axios.get(`https://app.asana.com/api/1.0/tasks/${task.gid}`, {
                  headers: { Authorization: `Bearer ${accessToken}` },
                  params: {
                    opt_fields: "completed",
                  },
                })

                if (
                  taskDetailsResponse.data &&
                  taskDetailsResponse.data.data &&
                  taskDetailsResponse.data.data.completed
                ) {
                  asanaMetrics.completedTaskCount++
                }
              }
            }
          }
        }
      }
    }

    // Update the integration with the fetched data and add to datatrails
    const datatrailEntry = {
      event: "Asana connected",
      timestamp: currentDate.toISOString(),
      details: {
        fieldsPopulated: Object.keys(asanaMetrics),
        connectionStatus: "success",
      },
    }

    // Convert asanaMetrics to Prisma.JsonValue

    const integration = await prisma.integration.findFirst({
      where: { userId, integrationType: "ASANA" },
    })

    if (integration) {
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          datatrails: {
            push: datatrailEntry,
          },
          connectedStatus: true,
          updatedAt: currentDate,
        },
      })
    } else {
      await prisma.integration.create({
        data: {
          userId,
          integrationType: "ASANA",
          datatrails: [datatrailEntry],
          connectedStatus: true,
          updatedAt: currentDate,
        },
      })
    }

    console.log("Asana data stored successfully")
  } catch (error) {
    console.error("Error fetching or storing Asana data:", error)
    throw error
  }
}

