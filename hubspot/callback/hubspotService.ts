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

export async function fetchAndStoreHubSpotData(userId: string, accessToken: string, hubId: string): Promise<void> {
  try {
    console.log("Fetching data from HubSpot API...")

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

    // Fetch deals from HubSpot to calculate revenue
    const dealsResponse = await axios.get("https://api.hubapi.com/crm/v3/objects/deals", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      params: {
        limit: 100,
        properties: ["amount", "closedate"],
        archived: false,
      },
    })

    if (dealsResponse.data && dealsResponse.data.results) {
      const deals = dealsResponse.data.results
      const totalRevenue = deals.reduce((sum: number, deal: any) => {
        const amount = Number.parseFloat(deal.properties.amount)
        return !isNaN(amount) ? sum + amount : sum
      }, 0)
      financialMetrics.revenue = totalRevenue
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
        archived: false,
      },
    })

    if (contactsResponse.data && contactsResponse.data.results) {
      const contacts = contactsResponse.data.results
      const totalContacts = contacts.length
      financialMetrics.userGrowth = totalContacts
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
        archived: false,
      },
    })

    if (companiesResponse.data && companiesResponse.data.results) {
      const companies = companiesResponse.data.results
      financialMetrics.leadConversions = companies.length
    }

    // Update the integration with the fetched data and add to datatrails
    const currentDate = new Date()
    const datatrailEntry = {
      event: "HubSpot data fetched",
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

