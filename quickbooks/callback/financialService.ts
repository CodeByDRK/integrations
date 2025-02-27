import axios from "axios";
import prisma from "@/lib/prisma";

export async function fetchAndStoreFinancialData(
  userId: string,
  realmId: string,
  accessToken: string,
  cashBalance: number = 100000, // Default cash balance, can be overridden by the user
) {
  try {
    console.log("Fetching financial data for user:", userId, "realmId:", realmId);

    // Fetch Profit and Loss data
    const profitAndLossData = await fetchProfitAndLoss(realmId, accessToken);

    // Fetch Balance Sheet data to get the actual cash balance
    const balanceSheetData = await fetchBalanceSheet(realmId, accessToken);
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
      where: { userId, integrationType: "QUICKBOOKS" },
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
    console.error("Error processing financial data:", error.message);
    throw error;
  }
}

// Fetch Profit and Loss data from QuickBooks
async function fetchProfitAndLoss(realmId: string, accessToken: string) {
  try {
    console.log("Fetching Profit and Loss data for realmId:", realmId);
    const response = await axios.get(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/reports/ProfitAndLoss`, // Switched to production environment
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
    );
    console.log("Profit and Loss API Response:", JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error: any) {
    console.error("Error fetching Profit and Loss data:", error.response?.data || error.message);
    throw error;
  }
}

// Fetch Balance Sheet data from QuickBooks
async function fetchBalanceSheet(realmId: string, accessToken: string) {
  try {
    console.log("Fetching Balance Sheet data for realmId:", realmId);
    const response = await axios.get(
      `https://quickbooks.api.intuit.com/v3/company/${realmId}/reports/BalanceSheet`, // Switched to production environment
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
    );
    console.log("Balance Sheet API Response:", JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error: any) {
    console.error("Error fetching Balance Sheet data:", error.response?.data || error.message);
    throw error;
  }
}

// Extract cash balance from Balance Sheet data
function extractCashBalance(balanceSheetData: any): number | null {
  if (!balanceSheetData?.Rows?.Row) {
    console.warn("No Balance Sheet data found");
    return null;
  }

  for (const row of balanceSheetData.Rows.Row) {
    if (row.ColData && row.ColData[0]?.value === "Bank Accounts") {
      const cashBalance = Number.parseFloat(row.ColData[1]?.value || "0");
      return cashBalance;
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
  const revenueMap = mapFinancialData(profitAndLossData, "Income");
  const expensesMap = mapFinancialData(profitAndLossData, "Expense");

  // Generate data for the past 90 days
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const date = d.toISOString().split("T")[0];
    const revenue = revenueMap[date] || 0; // Default to 0 if no data
    const expenses = expensesMap[date] || 0; // Default to 0 if no data
    const burnRate = expenses - revenue;
    const runway = burnRate > 0 ? (cashBalance / burnRate).toFixed(1) : null; // Calculate runway based on actual cash balance
    const fundraising = null; // Not available from QuickBooks

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

// Map financial data (revenue or expenses) from API response
function mapFinancialData(apiData: any, type: "Income" | "Expense"): Record<string, number> {
  const dataMap: Record<string, number> = {};

  if (!apiData?.Rows?.Row) {
    console.warn(`No ${type} data found in API response`);
    return dataMap;
  }

  for (const row of apiData.Rows.Row) {
    if (row.group === type && row.ColData && row.ColData.length >= 2) {
      const date = row.ColData[0]?.value;
      const amount = Number.parseFloat(row.ColData[1]?.value || "0");

      if (date) dataMap[date] = amount;
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