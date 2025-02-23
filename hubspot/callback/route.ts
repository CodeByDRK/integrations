import { NextResponse } from "next/server";
import axios from "axios";
import prisma from "@/lib/prisma";
import { encrypt } from "../../utils/encryption";
import { stackServerApp } from "@/stack";
import { fetchAndStoreHubSpotData } from "./hubspotService"; // Import the function

export async function GET(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) {
    console.error("Unauthorized: No user found");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;
  const url = new URL(req.url);
  const error = url.searchParams.get("error");
  const authCode = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  console.log("Received OAuth Parameters:", { authCode, state });

  if (error) {
    console.error("OAuth Error:", error, url.searchParams.get("error_description"));
    return NextResponse.json(
      {
        message: "Authorization Error",
        error,
        error_description: url.searchParams.get("error_description"),
      },
      { status: 400 }
    );
  }

  if (!authCode || !state) {
    console.error("Missing required parameters: authCode or state is null");
    return NextResponse.json({ message: "Missing required parameters" }, { status: 400 });
  }

  try {
    const tokenUrl = "https://api.hubapi.com/oauth/v1/token";
    const redirectUri = process.env.HUBSPOT_REDIRECT_URI;
    const clientId = process.env.HUBSPOT_INTEGRATION_CLIENT_ID;
    const clientSecret = process.env.HUBSPOT_INTEGRATION_CLIENT_SECRET;

    console.log("Environment Variables Check:", {
      redirectUri,
      clientId,
      clientSecret: clientSecret ? "Exists" : "Missing",
    });

    if (!redirectUri || !clientId || !clientSecret) {
      throw new Error("Missing required environment variables");
    }

    // Exchange auth code for access token
    const tokenResponse = await axios.post(
      tokenUrl,
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code: authCode,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    console.log("Token Response Data:", tokenResponse.data);

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    // Fetch HubSpot account details to get hubId
    const hubspotAccountInfoUrl = `https://api.hubapi.com/oauth/v1/access-tokens/${access_token}`;
    const accountInfoResponse = await axios.get(hubspotAccountInfoUrl, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const { hub_id } = accountInfoResponse.data;
    console.log("HubSpot Account Info:", accountInfoResponse.data);

    // Save to the database
    let integration = await prisma.integration.findFirst({
      where: { userId, integrationType: "HUBSPOT" },
    });

    if (integration) {
      integration = await prisma.integration.update({
        where: { id: integration.id },
        data: {
          accessToken: encrypt(access_token),
          refreshToken: encrypt(refresh_token),
          tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
          connectedStatus: true,
          hubId: hub_id?.toString() || null, // Save hubId
        },
      });
    } else {
      integration = await prisma.integration.create({
        data: {
          userId,
          integrationType: "HUBSPOT",
          accessToken: encrypt(access_token),
          refreshToken: encrypt(refresh_token),
          tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
          connectedStatus: true,
          hubId: hub_id?.toString() || null, // Save hubId
          updatedAt: new Date(),
        },
      });
    }

    // Fetch and store HubSpot data
    try {
      await fetchAndStoreHubSpotData(userId, access_token, hub_id);
      console.log("Successfully fetched and stored HubSpot data");
    } catch (error) {
      console.error("Error fetching HubSpot data:", error);
      // Continue the flow even if HubSpot data fetching fails
    }

    return new NextResponse(renderSuccessHtml(), {
      headers: { "Content-Type": "text/html" },
    });
  } catch (error: any) {
    console.error("Error:", error.response?.data || error.message);
    return NextResponse.json(
      {
        message: "Error processing request",
        details: error.response?.data || error.message || "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}

function renderSuccessHtml() {
  return `
    <html>
      <body>
        <div>HubSpot connected successfully</div>
        <script>setTimeout(() => window.close(), 5000);</script>
      </body>
    </html>
  `;
}
