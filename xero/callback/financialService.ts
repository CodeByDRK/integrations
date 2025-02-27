import axios from "axios";
import prisma from "@/lib/prisma";
import { decrypt, encrypt } from "../../utils/encryption";

export async function fetchAndStoreXeroFinancialData(
  userId: string,
  accessToken: string,
  tenantId: string,
  cashBalance: number = 100000, // Default cash balance, can be overridden by the user
) {
  try {
    console.log("Fetching financial data for user:", userId, "tenantId:", tenantId);

    // Fetch Profit and Loss data
    const profitAndLossData = await fetchXeroProfitAndLoss(tenantId, accessToken);

    // Fetch Balance Sheet data to get the actual cash balance
    const balanceSheetData = await fetchXeroBalanceSheet(tenantId, accessToken);
    const cashBalanceFromAPI = extractCashBalance(balanceSheetData);

    // Use the cash balance from the API if available, otherwise fall back to the default
    const effectiveCashBalance = cashBalanceFromAPI ?? cashBalance;

    // Calculate financial metrics
    const startDate = new Date(getStartDate(90)); // Last 90 days (converted to Date object)
    const endDate = new Date(getCurrentDate()); // Current date (converted to Date object)
    const financialData = calculateFinancialMetrics(
      profitAndLossData,
      startDate,
      endDate,
      effectiveCashBalance,
    );

    // Find the integration record for the user
    const integration = await prisma.integration.findFirst({
      where: { userId, integrationType: "XERO" },
    });

    if (integration) {
      // Update the integration record with the new financial data
      await prisma.integration.update({
        where: { id: integration.id },
        data: { integrationData: financialData, updatedAt: new Date() },
      });
      console.log("Financial data successfully stored for user:", userId);
    } else {
      console.error("No integration record found for user:", userId);
    }
  } catch (error: any) {
    console.error("Error processing Xero financial data:", error.message);
    throw error;
  }
}

// Fetch Profit and Loss data from Xero
async function fetchXeroProfitAndLoss(tenantId: string, accessToken: string) {
  try {
    console.log("Fetching Profit and Loss data for tenantId:", tenantId);
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
        periods: 3, // Last 3 months
        timeframe: "MONTH",
      },
    });
    console.log("Profit and Loss API Response:", JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error: any) {
    console.error("Error fetching Profit and Loss data from Xero:", error.response?.data || error.message);
    throw error;
  }
}

// Fetch Balance Sheet data from Xero
async function fetchXeroBalanceSheet(tenantId: string, accessToken: string) {
  try {
    console.log("Fetching Balance Sheet data for tenantId:", tenantId);
    const response = await axios.get(`https://api.xero.com/api.xro/2.0/Reports/BalanceSheet`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Xero-Tenant-Id": tenantId,
        Accept: "application/json",
        "User-Agent": "Your-App-Name",
      },
      params: {
        date: getCurrentDate(),
        periods: 1, // Current period only
        timeframe: "MONTH",
      },
    });
    console.log("Balance Sheet API Response:", JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error: any) {
    console.error("Error fetching Balance Sheet data from Xero:", error.response?.data || error.message);
    throw error;
  }
}

// Extract cash balance from Balance Sheet data
function extractCashBalance(balanceSheetData: any): number | null {
  if (!balanceSheetData?.Reports?.[0]?.Rows) {
    console.warn("No Balance Sheet data found");
    return null;
  }

  for (const row of balanceSheetData.Reports[0].Rows) {
    if (row.RowType === "Section" && row.Title === "Bank Accounts") {
      for (const cell of row.Rows) {
        if (cell.Cells && cell.Cells.length >= 2) {
          const amount = Number.parseFloat(cell.Cells[1]?.Value || "0");
          return amount;
        }
      }
    }
  }

  console.warn("Cash balance not found in Balance Sheet data");
  return null;
}

// Calculate financial metrics
function calculateFinancialMetrics(
  profitAndLossData: any,
  startDate: Date,
  endDate: Date,
  cashBalance: number,
) {
  const financialMetrics: any[] = [];
  const revenueMap = mapXeroFinancialData(profitAndLossData, "Revenue");
  const expensesMap = mapXeroFinancialData(profitAndLossData, "Expenses");

  // Generate data for the past 90 days
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const date = d.toISOString().split("T")[0];
    const revenue = revenueMap[date] || 0; // Default to 0 if no data
    const expenses = expensesMap[date] || 0; // Default to 0 if no data
    const burnRate = expenses - revenue;
    const runway = burnRate > 0 ? (cashBalance / burnRate).toFixed(1) : null; // Calculate runway based on actual cash balance
    const fundraising = null; // Not available from Xero

    financialMetrics.push({
      date,
      revenue,
      burnRate,
      runway: runway ? Number.parseFloat(runway) : null,
      fundraising,
    });
  }

  return financialMetrics;
}

// Map Xero financial data (e.g., Revenue, Expenses)
function mapXeroFinancialData(apiData: any, key: string): Record<string, number> {
  const dataMap: Record<string, number> = {};

  if (!apiData?.Reports?.[0]?.Rows) {
    console.warn(`No ${key} data found in API response`);
    return dataMap;
  }

  for (const row of apiData.Reports[0].Rows) {
    if (row.RowType === "Section" && row.Title === key) {
      for (const cell of row.Rows) {
        if (cell.Cells && cell.Cells.length >= 2) {
          const date = cell.Cells[0]?.Value;
          const amount = Number.parseFloat(cell.Cells[1]?.Value || "0");

          if (date) dataMap[date] = amount;
        }
      }
    }
  }

  return dataMap;
}

// Get the current date in YYYY-MM-DD format
function getCurrentDate(): string {
  return new Date().toISOString().split("T")[0];
}

// Get the start date (e.g., 90 days ago) in YYYY-MM-DD format
function getStartDate(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split("T")[0];
}