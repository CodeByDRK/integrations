import axios from "axios"
import prisma from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

interface FinancialMetrics {
  date: string
  revenue: number
  burnRate: number
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

export async function fetchAndStoreZohoData(userId: string, accessToken: string): Promise<void> {
  try {
    console.log("Fetching data from Zoho CRM API...")

    const currentDate = new Date()

    // Initialize the financial metrics structure
    const financialMetrics: FinancialMetrics = {
      date: currentDate.toISOString().split("T")[0], // Current date in YYYY-MM-DD format
      revenue: 0,
      burnRate: 0,
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
      demos: 0,
      leadConversions: 0,
      commissions: null,
    }

    // Fetch leads from Zoho CRM
    try {
      console.log("Fetching leads from Zoho CRM...")
      const leadsResponse = await axios.get("https://www.zohoapis.com/crm/v2/Leads", {
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
        },
      })

      console.log("Leads response:", leadsResponse.data)

      if (leadsResponse.data && leadsResponse.data.data) {
        const leads = leadsResponse.data.data
        const totalLeads = leads.length

        // Count converted leads
        const convertedLeads = leads.filter((lead: any) => lead.Converted === true).length

        // Update lead conversions metric
        financialMetrics.leadConversions = convertedLeads
        console.log(`Found ${convertedLeads} converted leads out of ${totalLeads} total leads`)
      }
    } catch (error) {
      console.error("Error fetching leads from Zoho:", error)
      // Continue with other API calls
    }

    // Fetch deals from Zoho CRM
    try {
      console.log("Fetching deals from Zoho CRM...")
      const dealsResponse = await axios.get("https://www.zohoapis.com/crm/v2/Deals", {
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
        },
      })

      console.log("Deals response:", dealsResponse.data)

      if (dealsResponse.data && dealsResponse.data.data) {
        const deals = dealsResponse.data.data

        // Calculate total revenue from deals
        let totalRevenue = 0
        deals.forEach((deal: any) => {
          if (deal.Amount && deal.Stage === "Closed Won") {
            totalRevenue += Number.parseFloat(deal.Amount)
          }
        })

        // Update revenue metric
        financialMetrics.revenue = totalRevenue
        console.log(`Calculated total revenue: ${totalRevenue} from closed won deals`)
      }
    } catch (error) {
      console.error("Error fetching deals from Zoho:", error)
      // Continue with other API calls
    }

    // Fetch tasks from Zoho CRM to count demos
    try {
      console.log("Fetching tasks from Zoho CRM...")
      const tasksResponse = await axios.get("https://www.zohoapis.com/crm/v2/Tasks", {
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
        },
      })

      console.log("Tasks response:", tasksResponse.data)

      if (tasksResponse.data && tasksResponse.data.data) {
        const tasks = tasksResponse.data.data

        // Count demo tasks
        const demoTasks = tasks.filter(
          (task: any) => task.Subject && task.Subject.toLowerCase().includes("demo"),
        ).length

        // Update demos metric
        financialMetrics.demos = demoTasks
        console.log(`Found ${demoTasks} demo tasks`)
      }
    } catch (error) {
      console.error("Error fetching tasks from Zoho:", error)
      // Continue with database update
    }

    // Update the integration with the data and add to datatrails
    const datatrailEntry = {
      event: "Zoho data fetched",
      timestamp: currentDate.toISOString(),
      details: {
        fieldsPopulated: Object.entries(financialMetrics)
          .filter(([_, value]) => value !== null && value !== 0)
          .map(([key]) => key),
      },
    }

    // Convert financialMetrics to a plain object that satisfies Prisma.JsonValue
    const integrationData: Prisma.JsonValue = Object.fromEntries(
      Object.entries(financialMetrics).map(([key, value]) => [key, value === null ? null : value]),
    )

    await prisma.integration.update({
      where: {
        id: (
          await prisma.integration.findFirst({
            where: { userId, integrationType: "ZOHO" },
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

    console.log("Zoho CRM data stored successfully")
  } catch (error) {
    console.error("Error fetching or storing Zoho CRM data:", error)
    throw error
  }
}

