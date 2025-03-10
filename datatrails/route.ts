import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { stackServerApp } from "@/stack"

export async function GET() {
  const user = await stackServerApp.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const integrations = await prisma.integration.findMany({
      where: { userId: user.id },
      select: {
        integrationType: true,
        datatrails: true,
      },
    })

    const dataTrails = integrations.flatMap((integration) => {
      const trails = integration.datatrails as any
      if (trails && typeof trails === "object" && trails.push) {
        return [
          {
            ...trails.push,
            integrationType: integration.integrationType,
          },
        ]
      }
      return []
    })

    // Sort dataTrails by timestamp, most recent first
    dataTrails.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    return NextResponse.json(dataTrails)
  } catch (error) {
    console.error("Error fetching data trails:", error)
    return NextResponse.json({ error: "Failed to fetch data trails" }, { status: 500 })
  }
}

