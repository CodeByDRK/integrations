import { NextResponse } from "next/server"
import axios from "axios"
import prisma from "@/lib/prisma"
import { stackServerApp } from "@/stack"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const error = url.searchParams.get("error")
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")

  if (error) {
    return NextResponse.json(
      {
        message: "Authorization Error",
        error,
        error_description: url.searchParams.get("error_description"),
      },
      { status: 400 },
    )
  }

  if (!code || !state) {
    return NextResponse.json({ message: "Missing required parameters" }, { status: 400 })
  }

  try {
    const { userId } = JSON.parse(state)
    const user = await stackServerApp.getUser()
    if (!user || user.id !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const clientId = process.env.SLACK_INTEGRATION_CLIENT_ID
    const clientSecret = process.env.SLACK_INTEGRATION_CLIENT_SECRET
    const redirectUri = process.env.SLACK_INTEGRATION_REDIRECT_URI

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error("Missing required environment variables")
    }

    const tokenResponse = await axios.post("https://slack.com/api/oauth.v2.access", null, {
      params: {
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirectUri,
      },
    })

    const { access_token, team, authed_user } = tokenResponse.data

    // Fetch additional team info
    const teamInfoResponse = await axios.get("https://slack.com/api/team.info", {
      headers: { Authorization: `Bearer ${access_token}` },
    })

    const teamData = teamInfoResponse.data.team

    let integration = await prisma.integration.findFirst({
      where: { userId, integrationType: "SLACK" },
    })

    if (integration) {
      integration = await prisma.integration.update({
        where: { id: integration.id },
        data: {
          accessToken: access_token,
          workSpaceId: team.id,
          connectedStatus: true,
        },
      })
    } else {
      integration = await prisma.integration.create({
        data: {
          userId,
          integrationType: "SLACK",
          accessToken: access_token,
          workSpaceId: team.id,
          connectedStatus: true,
          updatedAt: new Date(),
        },
      })
    }

    return new NextResponse(renderSuccessHtml(), {
      headers: { "Content-Type": "text/html" },
    })
  } catch (error: any) {
    console.error("Error:", error.response?.data || error.message)
    return NextResponse.json(
      {
        message: "Error processing request",
        details: error.response?.data || error.message || "Unknown error occurred",
      },
      { status: 500 },
    )
  }
}

function renderSuccessHtml() {
  return `
    <html>
      <body>
        <div>Slack connected successfully</div>
        <script>
          setTimeout(() => {
            window.opener.postMessage({ type: 'SLACK_INTEGRATION_COMPLETE' }, '*');
            window.close();
          }, 3000);
        </script>
      </body>
    </html>
  `
}

