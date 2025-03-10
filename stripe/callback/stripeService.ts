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

export async function fetchAndStoreStripeData(userId: string, apiKey: string): Promise<void> {
  try {
    console.log("Fetching data from Stripe API...")

    const currentDate = new Date()
    const ninetyDaysAgo = new Date(currentDate.getTime() - 90 * 24 * 60 * 60 * 1000)

    // Initialize the financial metrics structure
    const financialMetrics: FinancialMetrics = {
      date: currentDate.toISOString().split("T")[0],
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

    // Fetch balance to get available funds
    const balanceResponse = await axios.get("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    const availableFunds =
      balanceResponse.data.available.reduce((sum: number, balance: any) => sum + balance.amount, 0) / 100

    // Fetch total revenue (last 90 days)
    const chargesResponse = await axios.get("https://api.stripe.com/v1/charges", {
      headers: { Authorization: `Bearer ${apiKey}` },
      params: {
        created: { gte: Math.floor(ninetyDaysAgo.getTime() / 1000) },
        limit: 100,
      },
    })
    financialMetrics.revenue =
      chargesResponse.data.data.reduce((sum: number, charge: any) => sum + charge.amount, 0) / 100

    // Fetch customer count for user growth
    const customerCountResponse = await axios.get("https://api.stripe.com/v1/customers", {
      headers: { Authorization: `Bearer ${apiKey}` },
      params: { limit: 1 },
    })
    financialMetrics.userGrowth = customerCountResponse.data.total_count

    // Fetch subscription count for monthly active users (approximation)
    const subscriptionCountResponse = await axios.get("https://api.stripe.com/v1/subscriptions", {
      headers: { Authorization: `Bearer ${apiKey}` },
      params: { limit: 1, status: "active" },
    })
    financialMetrics.monthlyActiveUsers = subscriptionCountResponse.data.total_count

    // Calculate burn rate (if we have revenue data)
    if (financialMetrics.revenue !== null) {
      // This is a very simplified calculation and should be adjusted based on your business model
      const estimatedMonthlyExpenses = financialMetrics.revenue * 0.7 // Assuming 70% of revenue goes to expenses
      financialMetrics.burnRate = estimatedMonthlyExpenses
    }

    // Calculate runway if we have burn rate
    if (financialMetrics.burnRate !== null && financialMetrics.burnRate > 0) {
      financialMetrics.runway = availableFunds / financialMetrics.burnRate
    }

    // Update the integration with the fetched data and add to datatrails
    const datatrailEntry = {
      event: "Stripe data fetched",
      timestamp: currentDate.toISOString(),
      details: {
        fieldsPopulated: Object.entries(financialMetrics)
          .filter(([_, value]) => value !== null && value !== 0)
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
            where: { userId, integrationType: "STRIPE" },
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

    console.log("Stripe's data stored successfully")
  } catch (error) {
    console.error("Error fetching or storing Stripe data:", error)
    throw error
  }
}

