import axios from "axios";
import prisma from "@/lib/prisma";

export async function fetchAndStoreHubSpotData(userId: string, accessToken: string, hub_id: any) {
  try {
    console.log("Fetching HubSpot data for user:", userId);

    // Fetch referral rate, demos, lead conversions, and commissions
    const referralRate = await fetchHubSpotReferralRate(accessToken);
    const demos = await fetchHubSpotDemos(accessToken);
    const leadConversions = await fetchHubSpotLeadConversions(accessToken);
    const commissions = await fetchHubSpotCommissions(accessToken);

    // Generate financial metrics data
    const startDate = new Date(getStartDate(90)); // Last 90 days
    const endDate = new Date(getCurrentDate());
    const hubSpotData = calculateHubSpotMetrics(startDate, endDate, referralRate, demos, leadConversions, commissions);

    // Find the integration record for the user
    const integration = await prisma.integration.findFirst({
      where: { userId, integrationType: "HUBSPOT" },
    });

    if (integration) {
      await prisma.integration.update({
        where: { id: integration.id },
        data: { integrationData: hubSpotData, updatedAt: new Date() },
      });
      console.log("HubSpot data successfully stored for user:", userId);
    } else {
      console.error("No integration record found for user:", userId);
    }
  } catch (error: any) {
    console.error("Error processing HubSpot data:", error.message);
    throw error;
  }
}

async function fetchHubSpotReferralRate(accessToken: string) {
  return fetchHubSpotMetric(accessToken, "referral_rate");
}

async function fetchHubSpotDemos(accessToken: string) {
  return fetchHubSpotMetric(accessToken, "demos");
}

async function fetchHubSpotLeadConversions(accessToken: string) {
  return fetchHubSpotMetric(accessToken, "lead_conversions");
}

async function fetchHubSpotCommissions(accessToken: string) {
  return fetchHubSpotMetric(accessToken, "commissions");
}

async function fetchHubSpotMetric(accessToken: string, metric: string) {
  try {
    console.log(`Fetching ${metric} from HubSpot`);
    const response = await axios.get(`https://api.hubapi.com/analytics/v2/reports/${metric}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    return response.data || null;
  } catch (error: any) {
    console.error(`Error fetching ${metric} from HubSpot:`, error.response?.data || error.message);
    return null;
  }
}

function calculateHubSpotMetrics(startDate: Date, endDate: Date, referralRate: any, demos: any, leadConversions: any, commissions: any) {
  const hubSpotMetrics: any[] = [];

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const date = d.toISOString().split("T")[0];
    hubSpotMetrics.push({
      date,
      referralRate: referralRate?.[date] ?? null,
      demos: demos?.[date] ?? null,
      leadConversions: leadConversions?.[date] ?? null,
      commissions: commissions?.[date] ?? null,
    });
  }

  return hubSpotMetrics;
}

function getCurrentDate(): string {
  return new Date().toISOString().split("T")[0];
}

function getStartDate(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split("T")[0];
}
