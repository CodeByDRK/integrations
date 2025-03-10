import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { fetchAndStoreStripeData } from "./stripeService"

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const userId = formData.get("userId") as string
  const apiKey = formData.get("apiKey") as string

  if (!userId || !apiKey) {
    return NextResponse.json({ error: "Missing required parameters" }, { status: 400 })
  }

  try {
    let integration = await prisma.integration.findFirst({
      where: { userId, integrationType: "STRIPE" },
    })

    if (integration) {
      integration = await prisma.integration.update({
        where: { id: integration.id },
        data: {
          accessToken: apiKey, // Store the API key as the access token
          connectedStatus: true,
        },
      })
    } else {
      integration = await prisma.integration.create({
        data: {
          userId,
          integrationType: "STRIPE",
          accessToken: apiKey, // Store the API key as the access token
          connectedStatus: true,
          updatedAt: new Date(),
        },
      })
    }

    // Fetch and store Stripe data
    try {
      await fetchAndStoreStripeData(userId, apiKey)
      console.log("Successfully fetched and stored Stripe data")
    } catch (error) {
      console.error("Error fetching Stripe data:", error)
      // Continue the flow even if Stripe data fetching fails
    }

    return new NextResponse(renderSuccessHtml(), {
      headers: { "Content-Type": "text/html" },
    })
  } catch (error: any) {
    console.error("Error:", error.message)
    return NextResponse.json(
      {
        message: "Error processing request",
        details: error.message || "Unknown error occurred",
      },
      { status: 500 },
    )
  }
}

function renderSuccessHtml() {
  return `
    <html>
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-100 flex items-center justify-center min-h-screen">
        <div class="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
          <h1 class="text-2xl font-bold mb-4 text-gray-800">Stripe Connected Successfully</h1>
          <p class="text-gray-600 mb-4">Your Stripe account has been successfully connected. You can now close this window.</p>
          <script>
            setTimeout(() => {
              window.opener.postMessage({ type: 'STRIPE_INTEGRATION_COMPLETE' }, '*');
              window.close();
            }, 3000);
          </script>
        </div>
      </body>
    </html>
  `
}

