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

export async function fetchAndStoreSlackData(userId: string, accessToken: string, teamId: string): Promise<void> {
  try {
    console.log("Fetching data from Slack API...")

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

    // Fetch users to calculate user growth
    const usersResponse = await axios.get("https://slack.com/api/users.list", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (usersResponse.data && usersResponse.data.members) {
      financialMetrics.userGrowth = usersResponse.data.members.length
    }

    // Fetch channels to estimate activity
    const channelsResponse = await axios.get("https://slack.com/api/conversations.list", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params: {
        types: "public_channel,private_channel",
      },
    })

    if (channelsResponse.data && channelsResponse.data.channels) {
      const channels = channelsResponse.data.channels
      let totalMembers = 0
      channels.forEach((channel: any) => {
        totalMembers += channel.num_members || 0
      })
      financialMetrics.monthlyActiveUsers = totalMembers / channels.length // Average members per channel as a proxy for active users
    }

    // Fetch team info
    const teamInfoResponse = await axios.get("https://slack.com/api/team.info", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params: {
        team: teamId,
      },
    })

    if (teamInfoResponse.data && teamInfoResponse.data.team) {
      const team = teamInfoResponse.data.team
      // You could use the team.created timestamp to calculate the team's age
      // and potentially derive some growth or retention metrics
    }

    // Update the integration with the fetched data and add to datatrails
    const currentDate = new Date()
    const datatrailEntry = {
      event: "Slack data fetched",
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
            where: { userId, integrationType: "SLACK" },
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

    console.log("Slack data stored successfully")
  } catch (error) {
    console.error("Error fetching or storing Slack data:", error)
    throw error
  }
}

