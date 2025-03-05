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
    const tokenUrl = "https://auth.monday.com/oauth2/token";
    const redirectUri = process.env.MONDAYDOTCOM_REDIRECT_URI;
    const clientId = process.env.MONDAYDOTCOM_CLIENT_ID;
    const clientSecret = process.env.MONDAYDOTCOM_CLIENT_SECRET;

    console.log("Environment Variables Check:", {
      redirectUri,
      clientId,
      clientSecret: clientSecret ? "Exists" : "Missing",
    });

    if (!redirectUri || !clientId || !clientSecret) {
      throw new Error("Missing required environment variables");
    }

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

    const { access_token, refresh_token } = tokenResponse.data;

    // Set token expiration to 24 hours from now
    const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Fetch user info from Monday.com
    const userInfoQuery = `query { me { id name email } }`;
    const userInfoResponse = await axios.post(
      "https://api.monday.com/v2",
      { query: userInfoQuery },
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Monday.com User Info Response:", userInfoResponse.data);

    const mondayUserId = userInfoResponse.data.data.me.id;

    // Upsert Integration Data in Prisma
    let integration = await prisma.integration.findFirst({
      where: { userId, integrationType: "MONDAYDOTCOM" },
    });

    if (integration) {
      integration = await prisma.integration.update({
        where: { id: integration.id },
        data: {
          accessToken: access_token,
          refreshToken: refresh_token,
          tokenExpiresAt,
          connectedStatus: true,
          updatedAt: new Date(),
        },
      });
    } else {
      integration = await prisma.integration.create({
        data: {
          userId,
          integrationType: "MONDAYDOTCOM",
          accessToken: access_token,
          refreshToken: refresh_token,
          tokenExpiresAt,
          connectedStatus: true,
          updatedAt: new Date(),
        },
      });
    }

    console.log("Monday.com integration saved successfully:", integration);

    const successMessage = `<html><body><div>Monday.com connected successfully</div></body></html>`;

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
