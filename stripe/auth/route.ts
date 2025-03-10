import { NextResponse } from "next/server"
import { stackServerApp } from "@/stack"

export async function GET() {
  const user = await stackServerApp.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const userId = user.id

  // HTML content for the key input form
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Stripe Integration</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-gray-100 flex items-center justify-center min-h-screen">
        <div class="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
            <h1 class="text-2xl font-bold mb-6 text-center text-gray-800">Stripe Integration</h1>
            <p class="mb-4 text-gray-600">To securely access your Stripe data, please provide a restricted API key. This key will be used solely for fetching your financial metrics and will be stored securely.</p>
            <form action="/api/integrations/stripe/callback" method="POST" class="space-y-4">
                <input type="hidden" name="userId" value="${userId}">
                <div>
                    <label for="apiKey" class="block text-sm font-medium text-gray-700 mb-1">Restricted API Key</label>
                    <input type="password" id="apiKey" name="apiKey" required
                           class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                           placeholder="Enter your Stripe restricted API key">
                </div>
                <div>
                    <button type="submit"
                            class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                        Connect Stripe
                    </button>
                </div>
            </form>
            <p class="mt-4 text-xs text-gray-500">Your data security is our top priority. The provided key will be encrypted and used only for authorized data access.</p>
        </div>
    </body>
    </html>
  `

  return new NextResponse(htmlContent, {
    headers: { "Content-Type": "text/html" },
  })
}

