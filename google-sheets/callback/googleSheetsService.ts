import axios from "axios"
import prisma from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

interface FinancialMetrics {
  date: string
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

export async function fetchAndStoreGoogleSheetsData(userId: string, accessToken: string): Promise<void> {
  try {
    console.log("Fetching data from Google Sheets API...")

    const currentDate = new Date()

    // Initialize the financial metrics structure
    const financialMetrics: FinancialMetrics = {
      date: currentDate.toISOString().split("T")[0], // Current date in YYYY-MM-DD format
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

    // Fetch spreadsheets
    const spreadsheetsResponse = await axios.get("https://sheets.googleapis.com/v4/spreadsheets", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (spreadsheetsResponse.data && spreadsheetsResponse.data.spreadsheets) {
      const spreadsheets = spreadsheetsResponse.data.spreadsheets

      // You can process the spreadsheets data here
      // For example, you can count the number of spreadsheets
      const spreadsheetCount = spreadsheets.length

      // Update the integration with the fetched data and add to datatrails
      const datatrailEntry = {
        event: "Google Sheets data fetched",
        timestamp: currentDate.toISOString(),
        details: {
          fieldsPopulated: ["spreadsheetCount"],
        },
      }

      // Convert financialMetrics to Prisma.JsonValue
      const integrationData: Prisma.JsonValue = {
        ...financialMetrics,
        spreadsheetCount: spreadsheetCount,
      }

      const integration = await prisma.integration.findFirst({
        where: { userId, integrationType: "GOOGLE_SHEETS" },
      })

      if (integration) {
        await prisma.integration.update({
          where: { id: integration.id },
          data: {
            integrationData,
            datatrails: {
              push: datatrailEntry,
            },
            updatedAt: currentDate,
          },
        })
      } else {
        await prisma.integration.create({
          data: {
            userId,
            integrationType: "GOOGLE_SHEETS",
            integrationData,
            datatrails: [datatrailEntry],
            updatedAt: currentDate,
          },
        })
      }

      console.log("Google Sheets data stored successfully")
    }
  } catch (error) {
    console.error("Error fetching or storing Google Sheets data:", error)
    throw error
  }
}

