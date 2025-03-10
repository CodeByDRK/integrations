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

export async function fetchAndStoreQuickBooksFinancialData(
  userId: string,
  realmId: string,
  accessToken: string,
): Promise<void> {
  try {
    console.log("Fetching financial data from QuickBooks API...")

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

    // Fetch profit and loss report from QuickBooks
    const profitAndLossResponse = await axios.get(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/reports/ProfitAndLoss`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        params: {
          start_date: ninetyDaysAgo.toISOString().split("T")[0],
          end_date: currentDate.toISOString().split("T")[0],
        },
      },
    )

    if (profitAndLossResponse.data && profitAndLossResponse.data.Rows) {
      const rows = profitAndLossResponse.data.Rows.Row

      // Find the total income (revenue) row
      const totalIncomeRow = rows.find((row: any) => row.Summary?.ColData?.[0]?.value === "Total Income")
      if (totalIncomeRow && totalIncomeRow.Summary.ColData[1]) {
        const revenueValue = Number.parseFloat(totalIncomeRow.Summary.ColData[1].value)
        financialMetrics.revenue = !isNaN(revenueValue) ? revenueValue : 0
      }

      // Find the total expenses row
      const totalExpensesRow = rows.find((row: any) => row.Summary?.ColData?.[0]?.value === "Total Expenses")
      if (totalExpensesRow && totalExpensesRow.Summary.ColData[1]) {
        const expensesValue = Number.parseFloat(totalExpensesRow.Summary.ColData[1].value)
        if (!isNaN(expensesValue)) {
          financialMetrics.burnRate = expensesValue

          // Calculate runway if revenue is available
          if (financialMetrics.revenue > 0) {
            const monthlyProfit = financialMetrics.revenue - expensesValue
            if (monthlyProfit < 0 && expensesValue > 0) {
              // Runway in months = current cash / burn rate
              // Since we don't have current cash, we'll use a placeholder calculation
              financialMetrics.runway = Math.abs(financialMetrics.revenue / expensesValue) * 12
            }
          }
        }
      }
    }

    // Update the integration with the financial data and add to datatrails
    const datatrailEntry = {
      event: "QuickBooks data fetched",
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
            where: { userId, integrationType: "QUICKBOOKS" },
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

    console.log("QuickBooks financial data stored successfully")
  } catch (error) {
    console.error("Error fetching or storing QuickBooks financial data:", error)
    throw error
  }
}

