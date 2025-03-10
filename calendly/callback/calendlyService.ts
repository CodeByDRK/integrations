import axios from "axios"
import prisma from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

interface CalendlyMetrics {
  scheduledEvents: number
  activeEventTypes: number
  totalInvitees: number
}

export async function fetchAndStoreCalendlyData(userId: string, accessToken: string): Promise<void> {
  try {
    console.log("Fetching data from Calendly API...")

    const currentDate = new Date()
    const thirtyDaysAgo = new Date(currentDate.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Initialize the Calendly metrics structure
    const calendlyMetrics: CalendlyMetrics = {
      scheduledEvents: 0,
      activeEventTypes: 0,
      totalInvitees: 0,
    }

    // Fetch user information
    const userResponse = await axios.get("https://api.calendly.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    const userUri = userResponse.data.resource.uri

    // Fetch scheduled events
    const eventsResponse = await axios.get(`https://api.calendly.com/scheduled_events`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: {
        user: userUri,
        min_start_time: thirtyDaysAgo.toISOString(),
        max_start_time: currentDate.toISOString(),
      },
    })

    calendlyMetrics.scheduledEvents = eventsResponse.data.collection.length

    // Fetch active event types
    const eventTypesResponse = await axios.get(`https://api.calendly.com/event_types`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { user: userUri },
    })

    calendlyMetrics.activeEventTypes = eventTypesResponse.data.collection.filter(
      (eventType: any) => eventType.active,
    ).length

    // Fetch total invitees (this is an approximation, as we're limited by pagination)
    let totalInvitees = 0
    for (const event of eventsResponse.data.collection) {
      const inviteesResponse = await axios.get(`https://api.calendly.com/scheduled_events/${event.uri}/invitees`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      totalInvitees += inviteesResponse.data.collection.length
    }
    calendlyMetrics.totalInvitees = totalInvitees

    // Update the integration with the fetched data and add to datatrails
    const datatrailEntry = {
      event: "Calendly data fetched",
      timestamp: currentDate.toISOString(),
      details: {
        fieldsPopulated: Object.keys(calendlyMetrics),
      },
    }

    const integration = await prisma.integration.findFirst({
      where: { userId, integrationType: "CALENDLY" },
    })

    if (integration) {
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          datatrails: {
            push: datatrailEntry,
          },
          connectedStatus: true,
          updatedAt: currentDate,
        },
      })
    } else {
      await prisma.integration.create({
        data: {
          userId,
          integrationType: "CALENDLY",
          datatrails: [datatrailEntry],
          connectedStatus: true,
          updatedAt: currentDate,
        },
      })
    }

    console.log("Calendly data stored successfully")
  } catch (error) {
    console.error("Error fetching or storing Calendly data:", error)
    throw error
  }
}

