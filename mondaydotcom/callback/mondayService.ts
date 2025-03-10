import axios from "axios"
import prisma from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

interface MondayMetrics {
  boardCount: number
  itemCount: number
  userCount: number
}

export async function fetchAndStoreMondayData(userId: string, accessToken: string): Promise<void> {
  try {
    console.log("Fetching data from Monday.com API...")

    const currentDate = new Date()

    // Initialize the Monday.com metrics structure
    const mondayMetrics: MondayMetrics = {
      boardCount: 0,
      itemCount: 0,
      userCount: 0,
    }

    // Fetch boards, items, and users
    const query = `
      query {
        boards {
          id
        }
        items {
          id
        }
        users {
          id
        }
      }
    `

    const response = await axios.post(
      "https://api.monday.com/v2",
      { query },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    )

    mondayMetrics.boardCount = response.data.data.boards.length
    mondayMetrics.itemCount = response.data.data.items.length
    mondayMetrics.userCount = response.data.data.users.length

    // Update the integration with the fetched data and add to datatrails
    const datatrailEntry = {
      event: "Monday.com data fetched",
      timestamp: currentDate.toISOString(),
      details: {
        fieldsPopulated: Object.keys(mondayMetrics),
      },
    }

    const integration = await prisma.integration.findFirst({
        where: { userId, integrationType: "MONDAYDOTCOM" },
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
            integrationType: "MONDAYDOTCOM",
            datatrails: [datatrailEntry],
            connectedStatus: true,
            updatedAt: currentDate,
          },
        })
      }
  
    console.log("Monday.com data stored successfully")
  } catch (error) {
    console.error("Error fetching or storing Monday.com data:", error)
    throw error
  }
}

