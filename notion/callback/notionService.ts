import axios from "axios"
import prisma from "@/lib/prisma"
import { decrypt } from "../../utils/encryption"

export async function fetchAndStoreNotionData(userId: string, access_token: any) {
  try {
    console.log("Fetching Notion data for user:", userId)

    // Fetch the latest integration data from the database
    const integration = await prisma.integration.findFirst({
      where: { userId, integrationType: "NOTION" },
    })

    if (!integration) {
      console.error("No integration record found for user:", userId)
      return
    }

    const decryptedAccessToken = decrypt(integration.accessToken)
    const databaseId = integration.databaseId

    if (!databaseId) {
      console.log("No database ID found for user:", userId)
      // Store empty data or a message indicating no database is connected
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          integrationData: { message: "No Notion database connected" },
          updatedAt: new Date(),
        },
      })
      return
    }

    // Verify if the database exists and is accessible
    const databaseExists = await checkDatabaseExists(decryptedAccessToken, databaseId)
    if (!databaseExists) {
      console.log("Database not found or not accessible for user:", userId)
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          integrationData: { message: "Notion database not found or not accessible" },
          updatedAt: new Date(),
        },
      })
      return
    }

    // Fetch database schema to get property names
    const databaseSchema = await fetchDatabaseSchema(decryptedAccessToken, databaseId)

    // Use the schema to determine the correct property names
    const typeProperty = findPropertyByType(databaseSchema, "select")
    const dateProperty = findPropertyByType(databaseSchema, "date")

    if (!typeProperty || !dateProperty) {
      console.log("Required properties not found in the database schema for user:", userId)
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          integrationData: { message: "Notion database schema does not match required format" },
          updatedAt: new Date(),
        },
      })
      return
    }

    const newFeatures = await fetchItems(decryptedAccessToken, databaseId, typeProperty, dateProperty, "New Feature")
    const timeToMarket = await fetchItems(decryptedAccessToken, databaseId, typeProperty, dateProperty, "Project")
    const demos = await fetchItems(decryptedAccessToken, databaseId, typeProperty, dateProperty, "Demo")

    const notionData = calculateNotionMetrics(newFeatures, timeToMarket, demos, dateProperty)

    await prisma.integration.update({
      where: { id: integration.id },
      data: { integrationData: notionData, updatedAt: new Date() },
    })
    console.log("Notion data successfully stored for user:", userId)
  } catch (error: any) {
    console.error("Error processing Notion data:", error.message)
    throw error
  }
}

async function checkDatabaseExists(accessToken: string, databaseId: string) {
  try {
    await axios.get(`https://api.notion.com/v1/databases/${databaseId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Notion-Version": "2022-06-28",
      },
    })
    return true
  } catch (error) {
    console.error("Error checking database existence:", error)
    return false
  }
}

async function fetchDatabaseSchema(accessToken: string, databaseId: string) {
  try {
    const response = await axios.get(`https://api.notion.com/v1/databases/${databaseId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Notion-Version": "2022-06-28",
      },
    })
    return response.data.properties
  } catch (error) {
    console.error("Error fetching database schema:", error)
    throw error
  }
}

function findPropertyByType(schema: any, type: string) {
  return Object.keys(schema).find((key) => schema[key].type === type)
}

async function fetchItems(
  accessToken: string,
  databaseId: string,
  typeProperty: string,
  dateProperty: string,
  itemType: string,
) {
  try {
    const response = await axios.post(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      {
        filter: {
          and: [
            {
              property: typeProperty,
              select: {
                equals: itemType,
              },
            },
            {
              property: dateProperty,
              date: {
                is_not_empty: true,
              },
            },
          ],
        },
        sorts: [
          {
            property: dateProperty,
            direction: "descending",
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
      },
    )
    return response.data.results
  } catch (error) {
    console.error(`Error fetching ${itemType} from Notion:`, error)
    return []
  }
}

function calculateNotionMetrics(newFeatures: any[], timeToMarket: any[], demos: any[], dateProperty: string) {
  const notionMetrics: any[] = []
  const endDate = new Date()
  const startDate = new Date(endDate)
  startDate.setDate(startDate.getDate() - 90)

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const date = d.toISOString().split("T")[0]
    const featuresCount = newFeatures.filter((feature) => feature.properties[dateProperty]?.date?.start === date).length
    const timeToMarketMonths = calculateAverageTimeToMarket(timeToMarket, date, dateProperty)
    const demosCount = demos.filter((demo) => demo.properties[dateProperty]?.date?.start === date).length

    notionMetrics.push({
      date,
      newFeatures: featuresCount,
      timeToMarket: timeToMarketMonths,
      demos: demosCount,
    })
  }

  return notionMetrics
}

function calculateAverageTimeToMarket(projects: any[], date: string, dateProperty: string) {
  const relevantProjects = projects.filter((project) => project.properties[dateProperty]?.date?.end === date)
  if (relevantProjects.length === 0) return null

  const totalMonths = relevantProjects.reduce((sum, project) => {
    const startDate = new Date(project.properties[dateProperty]?.date?.start)
    const endDate = new Date(project.properties[dateProperty]?.date?.end)
    const months = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
    return sum + months
  }, 0)

  return totalMonths / relevantProjects.length
}

