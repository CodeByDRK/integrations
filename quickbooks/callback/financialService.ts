import axios from "axios"
import prisma from "@/lib/prisma"

export async function fetchAndStoreFinancialData(userId: string, realmId: string, accessToken: string) {
  try {
    console.log("Fetching financial data for user:", userId, "realmId:", realmId)
    const revenueData = await fetchProfitAndLoss(realmId, accessToken)
    const expensesData = await fetchExpenses(realmId, accessToken)

    if (!revenueData || !expensesData) {
      console.error("Failed to fetch financial data from QuickBooks")
      return
    }

    const financialData = calculateFinancialMetrics(revenueData, expensesData)

    const integration = await prisma.integration.findFirst({
      where: { userId, integrationType: "QUICKBOOKS" },
    })

    if (integration) {
      await prisma.integration.update({
        where: { id: integration.id },
        data: { integrationData: financialData, updatedAt: new Date() },
      })
      console.log("Financial data successfully stored for user:", userId)
    } else {
      console.error("No integration record found for user:", userId)
    }
  } catch (error: any) {
    console.error("Error processing financial data:", error.message)
    throw error
  }
}

async function fetchProfitAndLoss(realmId: string, accessToken: string) {
  try {
    console.log("Fetching Profit and Loss data for realmId:", realmId)
    const response = await axios.get(
      `https://sandbox-quickbooks.api.intuit.com/v3/company/${realmId}/reports/ProfitAndLoss`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "User-Agent": "Your-App-Name",
        },
        params: {
          start_date: getStartDate(90),
          end_date: getCurrentDate(),
          accounting_method: "Accrual",
        },
      },
    )
    console.log("Profit and Loss data fetched successfully")
    return response.data
  } catch (error: any) {
    console.error("Error fetching Profit and Loss data:", error.response?.data || error.message)
    throw error
  }
}

async function fetchExpenses(realmId: string, accessToken: string) {
  try {
    console.log("Fetching Expenses data for realmId:", realmId)
    const response = await axios.get(
      `https://sandbox-quickbooks.api.intuit.com/v3/company/${realmId}/reports/ProfitAndLoss`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "User-Agent": "Your-App-Name",
        },
        params: {
          start_date: getStartDate(90),
          end_date: getCurrentDate(),
          accounting_method: "Accrual",
        },
      },
    )
    console.log("Expenses data fetched successfully")
    return response.data
  } catch (error: any) {
    console.error("Error fetching Expenses data:", error.response?.data || error.message)
    throw error
  }
}

function getCurrentDate(): string {
  return new Date().toISOString().split("T")[0]
}

function getStartDate(daysAgo: number): string {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  return date.toISOString().split("T")[0]
}

function calculateFinancialMetrics(revenueData: any, expensesData: any) {
  const financialMetrics: any[] = []
  const revenueMap = mapFinancialData(revenueData)
  const expenseMap = mapFinancialData(expensesData)

  const endDate = new Date()
  const startDate = new Date(endDate)
  startDate.setDate(startDate.getDate() - 90)

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const date = d.toISOString().split("T")[0]
    const revenue = revenueMap[date] || 0
    const expenses = expenseMap[date] || 0
    const burnRate = expenses - revenue
    const runway = burnRate > 0 ? (100000 / burnRate).toFixed(1) : null // Assuming $100,000 cash balance
    const fundraising = null // Not available from QuickBooks

    financialMetrics.push({
      date,
      revenue,
      burnRate,
      runway: runway ? Number.parseFloat(runway) : null,
      fundraising,
    })
  }

  return financialMetrics
}

function mapFinancialData(apiData: any) {
  const dataMap: Record<string, number> = {}

  if (!apiData?.Rows?.Row) return dataMap

  for (const row of apiData.Rows.Row) {
    if (!row.ColData || row.ColData.length < 2) continue

    const date = row.ColData[0]?.value
    const amount = Number.parseFloat(row.ColData[1]?.value || "0")

    if (date) dataMap[date] = amount
  }

  return dataMap
}

