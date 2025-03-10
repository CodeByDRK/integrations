import axios from "axios"
import prisma from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

interface AnalyticsMetrics {
  date: string
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

export async function fetchAndStoreGoogleAnalyticsData(userId: string, accessToken: string): Promise<void> {
  try {
    console.log("Fetching data from Google Analytics API...")

    const currentDate = new Date()
    const thirtyDaysAgo = new Date(currentDate.getTime() - 30 * 24 * 60 * 60 * 1000)
    const sixtyDaysAgo = new Date(currentDate.getTime() - 60 * 24 * 60 * 60 * 1000)

    // Format dates for Google Analytics API
    const startDate = thirtyDaysAgo.toISOString().split("T")[0]
    const endDate = currentDate.toISOString().split("T")[0]
    const previousPeriodStart = sixtyDaysAgo.toISOString().split("T")[0]
    const previousPeriodEnd = thirtyDaysAgo.toISOString().split("T")[0]

    // Initialize the analytics metrics structure with all fields from the standard structure
    const analyticsMetrics: AnalyticsMetrics = {
      date: currentDate.toISOString().split("T")[0], // Current date in YYYY-MM-DD format
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

    // First, get the list of GA4 properties the user has access to
    const propertiesResponse = await axios.get("https://analyticsadmin.googleapis.com/v1alpha/properties", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (
      propertiesResponse.data &&
      propertiesResponse.data.properties &&
      propertiesResponse.data.properties.length > 0
    ) {
      // Use the first property for simplicity
      const propertyId = propertiesResponse.data.properties[0].name.split("/")[1]

      // Fetch current period users
      const currentPeriodResponse = await axios.post(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
        {
          dateRanges: [
            {
              startDate,
              endDate,
            },
          ],
          metrics: [
            { name: "totalUsers" },
            { name: "newUsers" },
            { name: "activeUsers" },
            { name: "userEngagementDuration" },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        },
      )

      // Fetch previous period users for growth calculation
      const previousPeriodResponse = await axios.post(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
        {
          dateRanges: [
            {
              startDate: previousPeriodStart,
              endDate: previousPeriodEnd,
            },
          ],
          metrics: [{ name: "totalUsers" }],
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        },
      )

      if (currentPeriodResponse.data && currentPeriodResponse.data.rows && currentPeriodResponse.data.rows.length > 0) {
        const metrics = currentPeriodResponse.data.rows[0].metricValues

        // Set monthly active users
        analyticsMetrics.monthlyActiveUsers = Number.parseInt(metrics[0].value) || null

        // Calculate user growth if previous period data is available
        if (
          previousPeriodResponse.data &&
          previousPeriodResponse.data.rows &&
          previousPeriodResponse.data.rows.length > 0
        ) {
          const previousUsers = Number.parseInt(previousPeriodResponse.data.rows[0].metricValues[0].value) || 0
          const currentUsers = analyticsMetrics.monthlyActiveUsers || 0

          if (previousUsers > 0) {
            // Calculate growth as percentage
            analyticsMetrics.userGrowth = ((currentUsers - previousUsers) / previousUsers) * 100
          }
        }

        // Calculate retention rate if we have new users data
        const newUsers = Number.parseInt(metrics[1].value) || 0
        const totalUsers = analyticsMetrics.monthlyActiveUsers || 0

        if (totalUsers > 0 && newUsers <= totalUsers) {
          const returningUsers = totalUsers - newUsers
          analyticsMetrics.retentionRate = (returningUsers / totalUsers) * 100

          // Churn rate is the opposite of retention rate
          analyticsMetrics.churnRate = 100 - analyticsMetrics.retentionRate
        }
      }
    }

    // Create a datatrail entry for the connection
    const datatrailEntry = {
      event: "Google Analytics connected",
      timestamp: currentDate.toISOString(),
      details: {
        fieldsPopulated: Object.entries(analyticsMetrics)
          .filter(([_, value]) => value !== null && value !== 0)
          .map(([key]) => key),
      },
    }

    // Convert analyticsMetrics to Prisma.JsonValue
    const integrationData: Prisma.JsonValue = Object.fromEntries(
      Object.entries(analyticsMetrics).map(([key, value]) => [key, value === null ? null : value]),
    )

    await prisma.integration.update({
      where: {
        id: (
          await prisma.integration.findFirst({
            where: { userId, integrationType: "GOOGLE_ANALYTICS" },
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

    console.log("Google Analytics data stored successfully")
  } catch (error) {
    console.error("Error fetching or storing Google Analytics data:", error)
    throw error
  }
}

