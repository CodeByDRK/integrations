import axios from "axios"
import prisma from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

interface FinancialMetrics {
  date: string
  revenue: number
  burnRate: number
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

export async function fetchAndStoreSalesforceData(
  userId: string,
  accessToken: string,
  instanceUrl: string,
): Promise<void> {
  try {
    console.log("Fetching data from Salesforce API...")

    const currentDate = new Date()
    const ninetyDaysAgo = new Date(currentDate.getTime() - 90 * 24 * 60 * 60 * 1000)

    // Initialize the financial metrics structure
    const financialMetrics: FinancialMetrics = {
      date: currentDate.toISOString().split("T")[0], // Current date in YYYY-MM-DD format
      revenue: 0,
      burnRate: 0,
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
      demos: 0,
      leadConversions: 0,
      commissions: null,
    }

    // Fetch Opportunities to calculate revenue
    const opportunitiesResponse = await axios.get(
      `${instanceUrl}/services/data/v52.0/query/?q=SELECT Amount FROM Opportunity WHERE CloseDate >= ${ninetyDaysAgo.toISOString().split("T")[0]} AND IsClosed = true AND IsWon = true`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    )

    if (opportunitiesResponse.data && opportunitiesResponse.data.records) {
      const opportunities = opportunitiesResponse.data.records
      financialMetrics.revenue = opportunities.reduce((sum: number, opp: any) => {
        return sum + (opp.Amount || 0)
      }, 0)
    }

    // Fetch Leads to calculate lead conversions
    const leadsResponse = await axios.get(
      `${instanceUrl}/services/data/v52.0/query/?q=SELECT COUNT() FROM Lead WHERE ConvertedDate >= ${ninetyDaysAgo.toISOString().split("T")[0]} AND IsConverted = true`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    )

    if (leadsResponse.data && leadsResponse.data.totalSize !== undefined) {
      financialMetrics.leadConversions = leadsResponse.data.totalSize
    }

    // Fetch Contacts to estimate user growth
    const contactsResponse = await axios.get(
      `${instanceUrl}/services/data/v52.0/query/?q=SELECT COUNT() FROM Contact WHERE CreatedDate >= ${ninetyDaysAgo.toISOString().split("T")[0]}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    )

    if (contactsResponse.data && contactsResponse.data.totalSize !== undefined) {
      financialMetrics.userGrowth = contactsResponse.data.totalSize
    }

    // Fetch Events to estimate demos
    const eventsResponse = await axios.get(
      `${instanceUrl}/services/data/v52.0/query/?q=SELECT COUNT() FROM Event WHERE StartDateTime >= ${ninetyDaysAgo.toISOString().split("T")[0]} AND Subject LIKE '%Demo%'`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    )

    if (eventsResponse.data && eventsResponse.data.totalSize !== undefined) {
      financialMetrics.demos = eventsResponse.data.totalSize
    }

    // Update the integration with the fetched data and add to datatrails
    const datatrailEntry = {
      event: "Salesforce data fetched",
      timestamp: currentDate.toISOString(),
      details: {
        fieldsPopulated: Object.entries(financialMetrics)
          .filter(([_, value]) => value !== null && value !== 0)
          .map(([key]) => key),
      },
    }

    // Convert financialMetrics to a plain object that satisfies Prisma.JsonValue
    const integrationData: Prisma.JsonValue = Object.fromEntries(
      Object.entries(financialMetrics).map(([key, value]) => [key, value === null ? null : value]),
    )

    await prisma.integration.update({
      where: {
        id: (
          await prisma.integration.findFirst({
            where: { userId, integrationType: "SALESFORCE" },
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

    console.log("Salesforce data stored successfully")
  } catch (error) {
    console.error("Error fetching or storing Salesforce data:", error)
    throw error
  }
}

