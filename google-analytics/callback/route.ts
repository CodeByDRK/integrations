import { NextResponse } from "next/server"
import axios from "axios"
import prisma from "@/lib/prisma"
import { encrypt } from "../../utils/encryption"
import { stackServerApp } from "@/stack"

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

  if (error) {
    return NextResponse.json(
      {
        message: "Authorization Error",
        error,
        error_description: url.searchParams.get("error_description"),
      },
      { status: 400 },
    );
  }

  if (!authCode || !state) {
    return NextResponse.json({ message: "Missing required parameters" }, { status: 400 });
  }

  try {
    const tokenUrl = "https://oauth2.googleapis.com/token";
    const redirectUri = process.env.GOOGLEANALYTICS_REDIRECT_URI;
    const clientId = process.env.GOOGLEANALYTICS_INTEGRATION_CLIENT_ID;
    const clientSecret = process.env.GOOGLEANALYTICS_INTEGRATION_CLIENT_SECRET;

    if (!redirectUri || !clientId || !clientSecret) {
      throw new Error("Missing required environment variables");
    }

    const tokenResponse = await axios.post(
      tokenUrl,
      {
        code: authCode,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    // Replace YOUR_PROPERTY_ID with a valid GA4 property ID
    const propertyId = "YOUR_PROPERTY_ID"; // Replace this with your actual GA4 property ID

    // Fetch Google Analytics data using the runReport endpoint
    const analyticsResponse = await axios.post(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        dateRanges: [{ startDate: "2023-01-01", endDate: "2023-12-31" }],
        dimensions: [{ name: "country" }],
        metrics: [{ name: "activeUsers" }],
      },
      {
        headers: { Authorization: `Bearer ${access_token}` },
      },
    );

    let integration = await prisma.integration.findFirst({
      where: { userId, integrationType: "GOOGLE_ANALYTICS" },
    });

    if (integration) {
      integration = await prisma.integration.update({
        where: { id: integration.id },
        data: {
          accessToken: encrypt(access_token),
          refreshToken: encrypt(refresh_token),
          tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
          connectedStatus: true,
          integrationData: analyticsResponse.data,
        },
      });
    } else {
      integration = await prisma.integration.create({
        data: {
          userId,
          integrationType: "GOOGLE_ANALYTICS",
          accessToken: encrypt(access_token),
          refreshToken: encrypt(refresh_token),
          tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
          connectedStatus: true,
          updatedAt: new Date(),
        },
      });
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
      { status: 500 },
    );
  }
}

function renderSuccessHtml() {
  return `
    <html>
      <body>
        <div>Google Analytics connected successfully</div>
        <script>setTimeout(() => window.close(), 5000);</script>
      </body>
    </html>
  `;
}