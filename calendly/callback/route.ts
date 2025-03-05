// app/api/calendly/callback/route.ts
import { type NextRequest, NextResponse } from "next/server";
import axios from "axios";
import prisma from "@/lib/prisma";
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
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  console.log("Received OAuth Parameters:", { code, state });

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

  if (!code || !state) {
    console.error("Missing required parameters: code or state is null");
    return NextResponse.json({ message: "Missing required parameters" }, { status: 400 });
  }

  try {
    const tokenUrl = "https://auth.calendly.com/oauth/token";
    const redirectUri = process.env.CALENDLY_REDIRECT_URI;
    const clientId = process.env.CALENDLY_CLIENT_ID;
    const clientSecret = process.env.CALENDLY_CLIENT_SECRET;

    console.log("Environment Variables Check:", {
      redirectUri,
      clientId,
      clientSecret: clientSecret ? "Exists" : "Missing",
    });

    if (!redirectUri || !clientId || !clientSecret) {
      throw new Error("Missing required environment variables");
    }

    // Exchange the authorization code for an access token
    const tokenResponse = await axios.post(
      tokenUrl,
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    console.log("Token Response Data:", tokenResponse.data);

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    // Fetch user information from Calendly
    const userInfoUrl = "https://api.calendly.com/users/me";
    const userInfoResponse = await axios.get(userInfoUrl, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    console.log("Calendly User Info Response:", userInfoResponse.data);

    const calendlyUserId = userInfoResponse.data.resource.uri;

    // Store the token in the database
    let integration = await prisma.integration.findFirst({
      where: { userId, integrationType: "CALENDLY" },
    });

    if (integration) {
      integration = await prisma.integration.update({
        where: { id: integration.id },
        data: {
          accessToken: access_token,
          refreshToken: refresh_token,
          tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
          connectedStatus: true,
        },
      });
    } else {
      integration = await prisma.integration.create({
        data: {
          userId,
          integrationType: "CALENDLY",
          accessToken: access_token,
          refreshToken: refresh_token,
          tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
          connectedStatus: true,
          updatedAt: new Date(),
        },
      });
    }

    const successMessage = `<html><body><div>Calendly connected successfully</div></body></html>`;

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