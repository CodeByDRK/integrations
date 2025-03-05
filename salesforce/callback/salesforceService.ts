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

export async function fetchAndStoreSalesforceData(
  userId: string,
  accessToken: string,
  instanceUrl: string,
): Promise<void> {
  try {
    console.log("Fetching data from Salesforce API...")

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

    // Fetch Opportunities to calculate revenue
    const opportunitiesResponse = await axios.get(
      `${instanceUrl}/services/data/v52.0/query/?q=SELECT Amount FROM Opportunity WHERE IsClosed = true AND IsWon = true`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      },
    )

    if (opportunitiesResponse.data && opportunitiesResponse.data.records) {
      const opportunities = opportunitiesResponse.data.records
      const totalRevenue = opportunities.reduce((sum: number, opp: any) => {
        return sum + (opp.Amount || 0)
      }, 0)
      financialMetrics.revenue = totalRevenue
    }

    // Fetch Leads to calculate lead conversions
    const leadsResponse = await axios.get(
      `${instanceUrl}/services/data/v52.0/query/?q=SELECT COUNT() FROM Lead WHERE IsConverted = true`,
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
      `${instanceUrl}/services/data/v52.0/query/?q=SELECT COUNT() FROM Contact`,
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

    // Update the integration with the fetched data and add to datatrails
    const currentDate = new Date()
    const datatrailEntry = {
      event: "Salesforce data fetched",
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

