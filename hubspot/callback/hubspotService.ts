import axios from "axios"
import prisma from "@/lib/prisma"
import { decrypt, encrypt } from "../../utils/encryption"

export async function fetchAndStoreHubSpotData(userId: string, accessToken: string, hub_id: any) {
  try {
    console.log("Fetching HubSpot data for user:", userId)

    const integration = await prisma.integration.findFirst({
      where: { userId, integrationType: "HUBSPOT" },
    })

    if (!integration) {
      console.error("No integration record found for user:", userId)
      return
    }

    // Refresh the token if expired
    const now = new Date()
    if (integration.tokenExpiresAt && integration.tokenExpiresAt < now) {
      console.log("Access token expired. Refreshing...")

      if (!integration.refreshToken) {
        throw new Error("Refresh token is missing. Unable to refresh access token.")
      }

      const newTokens = await refreshHubSpotToken(integration.refreshToken)
      accessToken = newTokens.access_token

      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          accessToken: encrypt(newTokens.access_token),
          refreshToken: encrypt(newTokens.refresh_token),
          tokenExpiresAt: new Date(Date.now() + newTokens.expires_in * 1000),
        },
      })
    }

    const hubSpotData = await fetchHubSpotMetrics(accessToken)

    if (!hubSpotData) {
      console.error("Failed to fetch data from HubSpot")
      return
    }

    await prisma.integration.update({
      where: { id: integration.id },
      data: { integrationData: hubSpotData, updatedAt: new Date() },
    })

    console.log("HubSpot data successfully stored for user:", userId)
  } catch (error: any) {
    console.error("Error processing HubSpot data:", error.message)
    throw error
  }
}

async function refreshHubSpotToken(refreshToken: string) {
  const tokenUrl = "https://api.hubapi.com/oauth/v1/token"
  const clientId = process.env.HUBSPOT_CLIENT_ID
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error("Missing HubSpot client credentials")
  }

  try {
    const response = await axios.post(
      tokenUrl,
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: decrypt(refreshToken),
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    )

    return response.data
  } catch (error) {
    console.error("Error refreshing HubSpot token:", error)
    throw error
  }
}

async function fetchHubSpotMetrics(accessToken: string) {
  try {
    console.log("Fetching HubSpot metrics")

    const endDate = new Date()
    const startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000) // 90 days ago

    // Fetch contacts to calculate referral rate
    const contactsResponse = await axios.get("https://api.hubapi.com/crm/v3/objects/contacts", {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        limit: 100,
        properties: ["createdate", "lifecyclestage"],
      },
    })
    const contacts = contactsResponse.data.results

    // Fetch deals to calculate demos and lead conversions
    const dealsResponse = await axios.get("https://api.hubapi.com/crm/v3/objects/deals", {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        limit: 100,
        properties: ["createdate", "dealstage", "amount"],
      },
    })
    const deals = dealsResponse.data.results

    // Generate daily data
    const dailyData = []
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const date = d.toISOString().split("T")[0]
      const dayContacts = contacts.filter(
        (c: any) => new Date(c.properties.createdate).toISOString().split("T")[0] === date,
      )
      const dayDeals = deals.filter((d: any) => new Date(d.properties.createdate).toISOString().split("T")[0] === date)

      const referrals = dayContacts.filter((c: any) => c.properties.lifecyclestage === "marketingqualifiedlead").length
      const referralRate = dayContacts.length > 0 ? (referrals / dayContacts.length) * 100 : 0
      const demos = dayDeals.filter((d: any) => d.properties.dealstage === "presentationscheduled").length
      const closedDeals = dayDeals.filter((d: any) => d.properties.dealstage === "closedwon").length
      const leadConversions = dayDeals.length > 0 ? (closedDeals / dayDeals.length) * 100 : 0
      const revenue = dayDeals.reduce(
        (sum: number, deal: any) => sum + (Number.parseFloat(deal.properties.amount) || 0),
        0,
      )
      const commissions = closedDeals * 100 // Assuming $100 commission per closed deal

      dailyData.push({
        date,
        referralRate: referralRate.toFixed(2),
        demos,
        leadConversions: leadConversions.toFixed(2),
        revenue: revenue.toFixed(2),
        commissions: commissions.toFixed(2),
      })
    }

    return dailyData
  } catch (error: any) {
    console.error("Error fetching HubSpot metrics:", error.response?.data || error.message)
    throw error
  }
}

