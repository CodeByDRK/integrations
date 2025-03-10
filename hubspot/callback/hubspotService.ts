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

export async function fetchAndStoreHubSpotData(userId: string, accessToken: string, hubId: string): Promise<void> {
  try {
    console.log("Fetching data from HubSpot API...")

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
      demos: null,
      leadConversions: null,
      commissions: null,
    }

    // Fetch deals from HubSpot to calculate revenue
    const dealsResponse = await axios.get("https://api.hubapi.com/crm/v3/objects/deals", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      params: {
        limit: 100,
        properties: ["amount", "closedate"],
        filterGroups: [
          {
            filters: [
              {
                propertyName: "closedate",
                operator: "GTE",
                value: ninetyDaysAgo.getTime().toString(),
              },
            ],
          },
        ],
      },
    })

    if (dealsResponse.data && dealsResponse.data.results) {
      const deals = dealsResponse.data.results
      financialMetrics.revenue = deals.reduce((sum: number, deal: any) => {
        const amount = Number.parseFloat(deal.properties.amount)
        return !isNaN(amount) ? sum + amount : sum
      }, 0)
    }

    // Fetch contacts to calculate user growth
    const contactsResponse = await axios.get("https://api.hubapi.com/crm/v3/objects/contacts", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      params: {
        limit: 100,
        properties: ["createdate"],
        filterGroups: [
          {
            filters: [
              {
                propertyName: "createdate",
                operator: "GTE",
                value: ninetyDaysAgo.getTime().toString(),
              },
            ],
          },
        ],
      },
    })

    if (contactsResponse.data && contactsResponse.data.results) {
      financialMetrics.userGrowth = contactsResponse.data.total
    }

    // Fetch companies to calculate lead conversions
    const companiesResponse = await axios.get("https://api.hubapi.com/crm/v3/objects/companies", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      params: {
        limit: 100,
        properties: ["createdate"],
        filterGroups: [
          {
            filters: [
              {
                propertyName: "createdate",
                operator: "GTE",
                value: ninetyDaysAgo.getTime().toString(),
              },
            ],
          },
        ],
      },
    })

    if (companiesResponse.data && companiesResponse.data.results) {
      financialMetrics.leadConversions = companiesResponse.data.total
    }

    // Update the integration with the fetched data and add to datatrails
    const datatrailEntry = {
      event: "HubSpot data fetched",
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
            where: { userId, integrationType: "HUBSPOT" },
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

    console.log("HubSpot data stored successfully")
  } catch (error) {
    console.error("Error fetching or storing HubSpot data:", error)
    throw error
  }
}

