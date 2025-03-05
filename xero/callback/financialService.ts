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

export async function fetchAndStoreXeroFinancialData(
  userId: string,
  accessToken: string,
  tenantId: string,
): Promise<void> {
  try {
    console.log("Fetching financial data from Xero API...")

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

    // Fetch profit and loss report from Xero
    const profitAndLossResponse = await axios.get("https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": tenantId,
        Accept: "application/json",
      },
      params: {
        date: new Date().toISOString().split("T")[0], // Today's date
      },
    })

    // Extract revenue from profit and loss report if available
    if (profitAndLossResponse.data && profitAndLossResponse.data.Reports) {
      const report = profitAndLossResponse.data.Reports[0]

      // Find the revenue section in the report
      const revenueSections = report.Rows.filter(
        (row: any) => row.Title === "Revenue" || row.Title === "Income" || row.Title === "Total Income",
      )

      if (revenueSections.length > 0 && revenueSections[0].Rows) {
        const revenueRow = revenueSections[0].Rows.find(
          (row: any) => row.RowType === "SummaryRow" || row.RowType === "Total",
        )

        if (revenueRow && revenueRow.Cells) {
          const revenueCell = revenueRow.Cells.find((cell: any) => cell.Value !== undefined)
          if (revenueCell) {
            // Extract numeric value from string (remove currency symbols, commas, etc.)
            const revenueValue = Number.parseFloat(revenueCell.Value.toString().replace(/[^0-9.-]+/g, ""))
            financialMetrics.revenue = !isNaN(revenueValue) ? revenueValue : null
          }
        }
      }

      // Calculate burn rate if expenses are available
      const expensesSections = report.Rows.filter(
        (row: any) => row.Title === "Expenses" || row.Title === "Total Expenses",
      )

      if (expensesSections.length > 0 && expensesSections[0].Rows) {
        const expensesRow = expensesSections[0].Rows.find(
          (row: any) => row.RowType === "SummaryRow" || row.RowType === "Total",
        )

        if (expensesRow && expensesRow.Cells) {
          const expensesCell = expensesRow.Cells.find((cell: any) => cell.Value !== undefined)
          if (expensesCell) {
            // Extract numeric value from string
            const expensesValue = Number.parseFloat(expensesCell.Value.toString().replace(/[^0-9.-]+/g, ""))
            if (!isNaN(expensesValue)) {
              financialMetrics.burnRate = expensesValue

              // Calculate runway if revenue is available
              if (financialMetrics.revenue !== null) {
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
      }
    }

    // Update the integration with the financial data and add to datatrails
    const currentDate = new Date()
    const datatrailEntry = {
      event: "Xero data fetched",
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
            where: { userId, integrationType: "XERO" },
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

    console.log("Financial data stored successfully")
  } catch (error) {
    console.error("Error fetching or storing Xero financial data:", error)
    throw error
  }
}

