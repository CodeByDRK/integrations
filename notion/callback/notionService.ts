import axios from "axios";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

interface FinancialMetrics {
  date: string;
  revenue: number;
  burnRate: number;
  runway: number | null;
  fundraising: number | null;
  userGrowth: number | null;
  retentionRate: number | null;
  churnRate: number | null;
  netPromoterScore: number | null;
  monthlyActiveUsers: number | null;
  newFeatures: any[] | null;
  adoptionRate: number | null;
  timeToMarket: number | null;
  referralRate: number | null;
  demos: number | null;
  leadConversions: number | null;
  commissions: number | null;
}

export async function fetchAndStoreNotionData(userId: string, accessToken: string): Promise<void> {
  try {
    console.log("Fetching data from Notion API...");

    const currentDate = new Date();
    const ninetyDaysAgo = new Date(currentDate.getTime() - 90 * 24 * 60 * 60 * 1000);

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
      newFeatures: [],
      adoptionRate: null,
      timeToMarket: null,
      referralRate: null,
      demos: null,
      leadConversions: null,
      commissions: null,
    };

    // Fetch databases from Notion
    const databasesResponse = await axios.post(
      "https://api.notion.com/v1/search",
      { filter: { property: "object", value: "database" } },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
      }
    );

    if (databasesResponse.data?.results) {
      const databases = databasesResponse.data.results;
      const financialDatabase = databases.find(
        (db: any) =>
          db.title[0]?.plain_text.toLowerCase().includes("financial") ||
          db.title[0]?.plain_text.toLowerCase().includes("metrics")
      );

      if (financialDatabase) {
        // Fetch content from the financial database
        const databaseContent = await axios.post(
          `https://api.notion.com/v1/databases/${financialDatabase.id}/query`,
          { filter: { property: "Date", date: { on_or_after: ninetyDaysAgo.toISOString().split("T")[0] } } },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Notion-Version": "2022-06-28",
              "Content-Type": "application/json",
            },
          }
        );

        if (databaseContent.data?.results) {
          const rows = databaseContent.data.results;

          rows.forEach((row: any) => {
            const properties = row.properties;
            Object.keys(financialMetrics).forEach((metric) => {
              const key = metric as keyof FinancialMetrics;

              // Check if the property exists and is a number
              if (properties[key]?.number !== undefined) {
                const value = properties[key].number;

                // Handle specific metrics
                if (key === "revenue" || key === "burnRate") {
                  financialMetrics[key] += value;
                } else if (financialMetrics[key] === null) {
                  // Ensure the value is of the correct type before assigning
                  if (typeof value === "number" || Array.isArray(value)) {
                    financialMetrics[key] = value;
                  }
                }
              }
            });
          });

          // Calculate runway if revenue and burn rate are available
          if (financialMetrics.revenue > 0 && financialMetrics.burnRate > 0) {
            const monthlyProfit = financialMetrics.revenue - financialMetrics.burnRate;
            if (monthlyProfit < 0) {
              financialMetrics.runway = Math.abs(financialMetrics.revenue / financialMetrics.burnRate) * 12;
            }
          }
        }
      }
    }

    // Fetch pages from Notion
    const pagesResponse = await axios.post(
      "https://api.notion.com/v1/search",
      { filter: { property: "object", value: "page" }, created_time: { on_or_after: ninetyDaysAgo.toISOString() } },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
      }
    );

    if (pagesResponse.data?.results) {
      financialMetrics.userGrowth = pagesResponse.data.results.length;
    }

    // Prepare datatrail entry
    const datatrailEntry = {
      event: "Notion data fetched",
      timestamp: currentDate.toISOString(),
      details: {
        fieldsPopulated: Object.entries(financialMetrics)
          .filter(([_, value]) => value !== null && value !== 0)
          .map(([key]) => key),
      },
    };

    // Prepare integration data
    const integrationData: Prisma.JsonValue = Object.fromEntries(
      Object.entries(financialMetrics).map(([key, value]) => [key, value === null ? null : value])
    );

    // Update the integration record in the database
    await prisma.integration.update({
      where: { id: (await prisma.integration.findFirst({ where: { userId, integrationType: "NOTION" } }))?.id },
      data: { integrationData, datatrails: { push: datatrailEntry }, updatedAt: currentDate },
    });

    console.log("Notion data stored successfully");
  } catch (error) {
    console.error("Error fetching or storing Notion data:", error);
    throw error;
  }
}