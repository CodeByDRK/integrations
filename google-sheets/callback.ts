import { NextApiRequest, NextApiResponse } from 'next';
import { google } from 'googleapis';
import prisma from '@/lib/prisma';
import { encrypt } from '../utils/encryption';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]/route';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const userId = session.user.id;

  // Check for error in the callback
  if (req.query.error) {
    return res.status(400).json({
      message: 'Authorization Error',
      error: req.query.error,
      error_description: req.query.error_description
    });
  }

  const authCode = req.query.code as string;

  if (!authCode) {
    return res.status(400).json({ message: 'Missing required parameters' });
  }

  try {
    const clientId = process.env.GOOGLE_SHEETS_INTEGRATION_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_SHEETS_INTEGRATION_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_SHEETS_INTEGRATION_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      console.error('Missing Google Sheets integration environment variables');
      throw new Error('Missing required environment variables');
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    const { tokens } = await oauth2Client.getToken(authCode);
    oauth2Client.setCredentials(tokens);

    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    // Find existing integration
    let integration = await prisma.integration.findFirst({
      where: { userId, integrationType: 'GOOGLE_SHEETS' },
    });

    if (integration) {
      // Update existing integration
      integration = await prisma.integration.update({
        where: { id: integration.id },
        data: {
          accessToken: encrypt(tokens.access_token!),
          refreshToken: encrypt(tokens.refresh_token!),
          tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          // email: userInfo.data.email!,
          connectedStatus: true,
        },
      });
    } else {
      // Create new integration
      integration = await prisma.integration.create({
        data: {
          userId,
          integrationType: 'GOOGLE_SHEETS',
          accessToken: encrypt(tokens.access_token!),
          refreshToken: encrypt(tokens.refresh_token!),
          tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          // email: userInfo.data.email!,
          connectedStatus: true,
        },
      });
    }

    res.send(`
      <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background-color: #f3f4f6;
            }
            .container {
              display: flex;
              align-items: center;
              gap: 2rem;
            }
            .image-container {
              position: relative;
              width: 192px;
              height: 192px;
            }
            .image {
              width: 100%;
              height: 100%;
              border-radius: 50%;
              object-fit: cover;
            }
            .loader {
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              transform: rotate(-90deg);
            }
            .loader-circle {
              fill: none;
              stroke: #3b82f6;
              stroke-width: 4;
              stroke-dasharray: 283;
              stroke-dashoffset: 283;
              animation: circleAnimation 2s ease-in-out forwards;
            }
            .text {
              font-size: 1.5rem;
              font-weight: 600;
              color: #000;
              opacity: 0;
              transform: translateX(-20px);
              animation: textAnimation 0.5s ease-out 1.5s forwards;
            }
            @keyframes circleAnimation {
              to {
                stroke-dashoffset: 0;
              }
            }
            @keyframes textAnimation {
              to {
                opacity: 1;
                transform: translateX(0);
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="image-container">
              <img src="/google-sheets-logo.png" alt="Google Sheets logo" class="image">
              <svg class="loader" viewBox="0 0 100 100">
                <circle class="loader-circle" cx="50" cy="50" r="45"></circle>
              </svg>
            </div>
            <div class="text">Google Sheets connected</div>
          </div>
          <script>
            setTimeout(() => {
              window.close();
            }, 5000);
          </script>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error('Error:', error);
    res.status(500).json({
      message: 'Error processing request',
      details: error.message || 'Unknown error occurred',
    });
  }
}