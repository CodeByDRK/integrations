import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
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

  if (req.query.error) {
    return res.status(400).json({
      message: 'Authorization Error',
      error: req.query.error,
      error_description: req.query.error_description
    });
  }

  const authCode = req.query.code as string;
  const state = req.query.state as string;

  if (!authCode || !state) {
    return res.status(400).json({ message: 'Missing required parameters' });
  }

  try {
    const { workspaceId } = JSON.parse(state);
    
    const tokenUrl = 'https://app.asana.com/-/oauth_token';
    const redirectUri = process.env.ASANA_INTEGRATION_REDIRECT_URI;
    const clientId = process.env.ASANA_INTEGRATION_CLIENT_ID;
    const clientSecret = process.env.ASANA_INTEGRATION_CLIENT_SECRET;

    if (!redirectUri || !clientId || !clientSecret) {
      throw new Error('Missing required environment variables');
    }

    const tokenResponse = await axios.post(tokenUrl, 
      {
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code: authCode
      },
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    // Fetch user's Asana account information
    const userInfoResponse = await axios.get('https://app.asana.com/api/1.0/users/me', {
      headers: { 'Authorization': `Bearer ${access_token}` }
    });

    const userData = userInfoResponse.data.data;

    let integration = await prisma.integration.findFirst({
      where: { userId, integrationType: 'ASANA' },
    });

    if (integration) {
      integration = await prisma.integration.update({
        where: { id: integration.id },
        data: {
          accessToken: encrypt(access_token),
          refreshToken: encrypt(refresh_token),
          tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
          workSpaceId: workspaceId,
          connectedStatus: true,
          integrationData: userData,
        },
      });
    } else {
      integration = await prisma.integration.create({
        data: {
          userId,
          integrationType: 'ASANA',
          accessToken: encrypt(access_token),
          refreshToken: encrypt(refresh_token),
          tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
          workSpaceId: workspaceId,
          connectedStatus: true,
          integrationData: userData,
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
              stroke: #FC636B;
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
            <div class="text">Asana connected successfully</div>
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

