import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { stackServerApp } from "@/stack"
import type { IntegrationType } from "@prisma/client" // Add this import

export async function DELETE(request: Request, { params }: { params: { integration: string } }) {
  try {
    console.log(`Deleting ${params.integration} integration...`)
    const user = await stackServerApp.getUser()
    if (!user) {
      console.log("User not authenticated")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const userId = user.id
    console.log("User ID:", userId)

    const integrationType = params.integration.toUpperCase() as IntegrationType

    console.log(`Deleting ${integrationType} integration from database...`)
    const deletedIntegration = await prisma.integration.deleteMany({
      where: {
        userId,
        integrationType,
      },
    })

    if (deletedIntegration.count === 0) {
      console.log(`${integrationType} integration not found for user`)
      return NextResponse.json({ message: `${integrationType} integration not found` }, { status: 404 })
    }

    console.log(`${integrationType} integration deleted successfully`)

    return NextResponse.json({ message: `${integrationType} integration deleted successfully` })
  } catch (error) {
    console.error(`Error deleting ${params.integration} integration:`, error)
    return NextResponse.json({ message: "Internal Server Error", details: (error as Error).message }, { status: 500 })
  }
}

