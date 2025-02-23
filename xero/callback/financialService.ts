import axios from "axios"
import prisma from "@/lib/prisma"
import { decrypt, encrypt } from "../../utils/encryption"

export async function fetchAndStoreXeroFinancialData(userId: string, accessToken: string, tenantId: string) {
  try {
    console.log("Fetching financial data for user:", userId, "tenantId:", tenantId)

    // Fetch the latest integration data from the database
    const integration = await prisma.integration.findFirst({
      where: { userId, integrationType: "XERO" },
    })

    if (!integration) {
      console.error("No integration record found for user:", userId)
      return
    }

    // Check if the token needs to be refreshed
    const now = new Date()
    if (integration.tokenExpiresAt && integration.tokenExpiresAt < now) {
      console.log("Access token expired. Refreshing...")

      if (!integration.refreshToken) {
        throw new Error("Refresh token is missing. Unable to refresh access token.")
      }

      const newTokens = await refreshXeroToken(integration.refreshToken)
      accessToken = newTokens.access_token

      // Update the integration record with new tokens
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          accessToken: encrypt(newTokens.access_token),
          refreshToken: encrypt(newTokens.refresh_token),
          tokenExpiresAt: new Date(Date.now() + newTokens.expires_in * 1000),
        },
      })
    }

    const revenueData = await fetchXeroProfitAndLoss(tenantId, accessToken)
    const expensesData = revenueData // Xero P&L report includes both revenue & expenses

    if (!revenueData) {
      console.error("Failed to fetch financial data from Xero")
      return
    }

    const financialData = calculateFinancialMetrics(revenueData, expensesData)

    await prisma.integration.update({
      where: { id: integration.id },
      data: { integrationData: financialData, updatedAt: new Date() },
    })
    console.log("Financial data successfully stored for user:", userId)
  } catch (error: any) {
    console.error("Error processing Xero financial data:", error.message)
    throw error
  }
}

async function refreshXeroToken(refreshToken: string) {
  const tokenUrl = "https://identity.xero.com/connect/token"
  const clientId = process.env.XERO_CLIENT_INTEGRATION_ID
  const clientSecret = process.env.XERO_CLIENT_INTEGRATION_SECRET

  if (!clientId || !clientSecret) {
    throw new Error("Missing Xero client credentials")
  }

  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")

  try {
    const response = await axios.post(
      tokenUrl,
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: decrypt(refreshToken),
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${authHeader}`,
        },
      },
    )

    return response.data
  } catch (error) {
    console.error("Error refreshing Xero token:", error)
    throw error
  }
}

async function fetchXeroProfitAndLoss(tenantId: string, accessToken: string) {
  try {
    console.log("Fetching Profit and Loss data for tenantId:", tenantId)
    const response = await axios.get(`https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": tenantId,
        Accept: "application/json",
        "User-Agent": "Your-App-Name",
      },
      params: {
        fromDate: getStartDate(90),
        toDate: getCurrentDate(),
        periods: 3,
        timeframe: "MONTH",
      },
    })
    console.log("Profit and Loss data fetched successfully from Xero")
    return response.data
  } catch (error: any) {
    console.error("Error fetching Profit and Loss data from Xero:", error.response?.data || error.message)
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
  const revenueMap = mapXeroFinancialData(revenueData, "TotalRevenue")
  const expenseMap = mapXeroFinancialData(expensesData, "TotalExpenses")

  const endDate = new Date()
  const startDate = new Date(endDate)
  startDate.setDate(startDate.getDate() - 90)

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const date = d.toISOString().split("T")[0]
    const revenue = revenueMap[date] || 0
    const expenses = expenseMap[date] || 0
    const burnRate = expenses - revenue
    const runway = burnRate > 0 ? (100000 / burnRate).toFixed(1) : null // Assuming $100,000 cash balance
    const fundraising = null // Not available from Xero

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

// ✅ Extracts TotalRevenue & TotalExpenses from Xero's P&L Report
function mapXeroFinancialData(apiData: any, key: string) {
  const dataMap: Record<string, number> = {}

  if (!apiData?.Reports?.[0]?.Rows) return dataMap

  for (const row of apiData.Reports[0].Rows) {
    if (!row.Cells || row.Cells.length < 2) continue

    const date = row.Cells[0]?.Value
    const amount = Number.parseFloat(row.Cells[1]?.Value || "0")

    if (date) dataMap[date] = amount
  }

  return dataMap
}

