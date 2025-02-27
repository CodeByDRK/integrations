import { type NextRequest, NextResponse } from "next/server";
import axios from "axios";
import prisma from "@/lib/prisma";
import { encrypt } from "../../utils/encryption";
import { stackServerApp } from "@/stack";

export async function GET(req: NextRequest) {
  const user = await stackServerApp.getUser();
  if (!user) {
    console.error("Unauthorized: No user found");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = user.id;
  const searchParams = req.nextUrl.searchParams;
  const error = searchParams.get("error");
  const authCode = searchParams.get("code");
  const state = searchParams.get("state");

  console.log("Received OAuth Parameters:", { authCode, state });

  if (error) {
    console.error("OAuth Error:", error, searchParams.get("error_description"));
    return NextResponse.json(
      {
        message: "Authorization Error",
        error,
        error_description: searchParams.get("error_description"),
      },
      { status: 400 }
    );
  }

  if (!authCode || !state) {
    console.error("Missing required parameters: authCode or state is null");
    return NextResponse.json({ message: "Missing required parameters" }, { status: 400 });
  }

  try {
    const tokenUrl = "https://oauth2.googleapis.com/token";
    const redirectUri = process.env.GOOGLEANALYTICS_REDIRECT_URI;
    const clientId = process.env.GOOGLEANALYTICS_INTEGRATION_CLIENT_ID;
    const clientSecret = process.env.GOOGLEANALYTICS_INTEGRATION_CLIENT_SECRET;

    console.log("Environment Variables Check:", {
      redirectUri,
      clientId,
      clientSecret: clientSecret ? "Exists" : "Missing",
    });

    if (!redirectUri || !clientId || !clientSecret) {
      throw new Error("Missing required environment variables");
    }

    console.log("Sending token request to Google Analytics with:", {
      grant_type: "authorization_code",
      code: authCode,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    });

    const tokenResponse = await axios.post(tokenUrl, {
      grant_type: "authorization_code",
      code: authCode,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    });

    console.log("Token Response Data:", tokenResponse.data);

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

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

    const successMessage = `<html><body><div>Google Analytics connected successfully</div></body></html>`;
    return new NextResponse(successMessage, {
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
