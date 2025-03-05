import axios from "axios"
import prisma from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

interface FinancialMetrics {
  revenue: number | null
  burnRate: number | null
  runway: number | null
  fundraising: number | null
  userGrowth: number | null
  retentionRate: number | null
  churnRate: number | null
  netPromoterScore: number | null
  monthlyActiveUsers: number | null
  newFeatures: any[] | null
  adoptionRate: number | null
  timeToMarket: number | null
  referralRate: number | null
  demos: number | null
  leadConversions: number | null
  commissions: number | null
}

export async function fetchAndStoreNotionData(userId: string, accessToken: string): Promise<void> {
  try {
    console.log("Fetching data from Notion API...")

    // Initialize the financial metrics structure with all null values
    const financialMetrics: FinancialMetrics = {
      revenue: null,
      burnRate: null,
      runway: null,
      fundraising: null,
      userGrowth: null,
      retentionRate: null,
      churnRate: null,
      netPromoterScore: null,
      monthlyActiveUsers: null,
      newFeatures: null,
      adoptionRate: null,
      timeToMarket: null,
      referralRate: null,
      demos: null,
      leadConversions: null,
      commissions: null,
    }

    // Fetch databases from Notion
    const databasesResponse = await axios.post(
      "https://api.notion.com/v1/search",
      {
        filter: { property: "object", value: "database" },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
      },
    )

    if (databasesResponse.data && databasesResponse.data.results) {
      const databases = databasesResponse.data.results

      // Look for a database that might contain financial metrics
      const financialDatabase = databases.find(
        (db: any) =>
          db.title[0]?.plain_text.toLowerCase().includes("financial") ||
          db.title[0]?.plain_text.toLowerCase().includes("metrics"),
      )

      if (financialDatabase) {
        // Fetch the content of the financial database
        const databaseContent = await axios.post(
          `https://api.notion.com/v1/databases/${financialDatabase.id}/query`,
          {},
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Notion-Version": "2022-06-28",
              "Content-Type": "application/json",
            },
          },
        )

        if (databaseContent.data && databaseContent.data.results) {
          const rows = databaseContent.data.results

          // Process each row to extract financial metrics
          rows.forEach((row: any) => {
            const properties = row.properties
            Object.keys(financialMetrics).forEach((metric) => {
              if (properties[metric] && properties[metric].number !== undefined) {
                financialMetrics[metric as keyof FinancialMetrics] = properties[metric].number
              }
            })
          })
        }
      }
    }

    // Fetch pages to estimate user growth or other metrics
    const pagesResponse = await axios.post(
      "https://api.notion.com/v1/search",
      {
        filter: { property: "object", value: "page" },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
      },
    )

    if (pagesResponse.data && pagesResponse.data.results) {
      const pages = pagesResponse.data.results
      financialMetrics.userGrowth = pages.length // Using page count as a proxy for user growth
    }

    // Update the integration with the fetched data and add to datatrails
    const currentDate = new Date()
    const datatrailEntry = {
      event: "Notion data fetched",
      timestamp: currentDate.toISOString(),
      details: {
        fieldsPopulated: Object.entries(financialMetrics)
          .filter(([_, value]) => value !== null)
          .map(([key]) => key),
      },
    }

    // Convert financialMetrics to Prisma.JsonValue
    const integrationData: Prisma.JsonValue = Object.fromEntries(
      Object.entries(financialMetrics).map(([key, value]) => [key, value === null ? null : value]),
    )

    await prisma.integration.update({
      where: {
        id: (
          await prisma.integration.findFirst({
            where: { userId, integrationType: "NOTION" },
          })
        )?.id,
      },
      data: {
        integrationData,
        datatrails: {
          push: datatrailEntry,
        },
        updatedAt: currentDate,
      },
    })

    console.log("Notion data stored successfully")
  } catch (error) {
    console.error("Error fetching or storing Notion data:", error)
    throw error
  }
}

