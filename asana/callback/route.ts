import { NextResponse } from "next/server"
import axios from "axios"
import prisma from "@/lib/prisma"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const error = url.searchParams.get("error")
  const authCode = url.searchParams.get("code")
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

  if (!authCode || !state) {
    return NextResponse.json({ message: "Missing required parameters" }, { status: 400 })
  }

  try {
    const { csrfToken, userId } = JSON.parse(state)

    const tokenUrl = "https://app.asana.com/-/oauth_token"
    const redirectUri = process.env.ASANA_INTEGRATION_REDIRECT_URI
    const clientId = process.env.ASANA_INTEGRATION_CLIENT_ID
    const clientSecret = process.env.ASANA_INTEGRATION_CLIENT_SECRET

    if (!redirectUri || !clientId || !clientSecret) {
      throw new Error("Missing required environment variables")
    }

    const tokenResponse = await axios.post(
      tokenUrl,
      {
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code: authCode,
      },
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    )

    const { access_token, refresh_token, expires_in } = tokenResponse.data

    // Fetch user's Asana workspaces
    const workspacesResponse = await axios.get("https://app.asana.com/api/1.0/workspaces", {
      headers: { Authorization: `Bearer ${access_token}` },
    })

    const workspaces = workspacesResponse.data.data

    // Render a page for workspace selection
    return new NextResponse(renderWorkspaceSelectionHtml(workspaces, userId, access_token, refresh_token, expires_in), {
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

export async function POST(req: Request) {
  const body = await req.json()
  const { userId, workspaceId, accessToken, refreshToken, expiresIn } = body

  try {
    let integration = await prisma.integration.findFirst({
      where: { userId, integrationType: "ASANA" },
    })

    if (integration) {
      integration = await prisma.integration.update({
        where: { id: integration.id },
        data: {
          accessToken: accessToken,
          refreshToken: refreshToken,
          tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
          workSpaceId: workspaceId,
          connectedStatus: true,
        },
      })
    } else {
      integration = await prisma.integration.create({
        data: {
          userId,
          integrationType: "ASANA",
          accessToken: accessToken,
          refreshToken: refreshToken,
          tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
          workSpaceId: workspaceId,
          connectedStatus: true,
          updatedAt: new Date(),
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Error saving integration:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
function renderWorkspaceSelectionHtml(
  workspaces: any[],
  userId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
) {
  return `
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Select Asana Workspace</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #f4f4f4;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
          }
          .container {
            background-color: white;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            max-width: 400px;
            width: 100%;
          }
          h1 {
            color: #283593;
            text-align: center;
            margin-bottom: 1.5rem;
          }
          .workspace-list {
            list-style-type: none;
            padding: 0;
          }
          .workspace-button {
            width: 100%;
            padding: 0.75rem;
            margin-bottom: 0.5rem;
            border: none;
            background-color: #3f51b5;
            color: white;
            font-size: 1rem;
            border-radius: 4px;
            cursor: pointer;
            transition: background-color 0.3s ease;
          }
          .workspace-button:hover {
            background-color: #283593;
          }
          .loading {
            display: none;
            text-align: center;
            margin-top: 1rem;
          }
          .error {
            color: #d32f2f;
            text-align: center;
            margin-top: 1rem;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Select Your Asana Workspace</h1>
          <ul class="workspace-list">
            ${workspaces
              .map(
                (workspace) => `
              <li>
                <button class="workspace-button" onclick="selectWorkspace('${workspace.gid}')">${workspace.name}</button>
              </li>
            `,
              )
              .join("")}
          </ul>
          <div id="loading" class="loading">Connecting to Asana...</div>
          <div id="error" class="error"></div>
        </div>
        <script>
          async function selectWorkspace(workspaceId) {
            const loadingEl = document.getElementById('loading');
            const errorEl = document.getElementById('error');
            loadingEl.style.display = 'block';
            errorEl.textContent = '';

            try {
              const response = await fetch('/api/integrations/asana/callback', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  userId: '${userId}',
                  workspaceId: workspaceId,
                  accessToken: '${accessToken}',
                  refreshToken: '${refreshToken}',
                  expiresIn: ${expiresIn}
                }),
              });
              const result = await response.json();
              if (result.success) {
                document.body.innerHTML = '<div style="text-align: center; padding: 2rem;"><h2 style="color: #4caf50;">Asana connected successfully!</h2><p>This window will close in 3 seconds.</p></div>';
                setTimeout(() => window.close(), 3000);
              } else {
                throw new Error('Failed to save integration');
              }
            } catch (error) {
              console.error('Error:', error);
              loadingEl.style.display = 'none';
              errorEl.textContent = 'Error connecting to Asana. Please try again.';
            }
          }
        </script>
      </body>
    </html>
  `
}

