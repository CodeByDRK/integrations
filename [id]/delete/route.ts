import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { stackServerApp } from "@/stack"

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await stackServerApp.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const integrationId = Number.parseInt(params.id, 10)

    if (isNaN(integrationId)) {
      return NextResponse.json({ error: "Invalid integration ID" }, { status: 400 })
    }

    const deletedIntegration = await prisma.integration.deleteMany({
      where: {
        userId: user.id,
        id: integrationId,
      },
    })

    if (deletedIntegration.count === 0) {
      return NextResponse.json({ error: "Integration not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting integration:", error)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

