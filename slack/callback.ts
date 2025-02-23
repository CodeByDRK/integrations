import { NextApiRequest, NextApiResponse } from 'next';
import axios from 'axios';
import prisma from '@/lib/prisma';
import { encrypt } from '../utils/encryption';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]/route';
// import fetchAndSaveSlackData from './fetchslackdata';

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
    const tokenUrl = 'https://slack.com/api/oauth.v2.access';
    const redirectUri = process.env.SLACK_REDIRECT_URI;
    const clientId = process.env.SLACK_CLIENT_ID;
    const clientSecret = process.env.SLACK_CLIENT_SECRET;

    if (!redirectUri || !clientId || !clientSecret) {
      throw new Error('Missing required environment variables');
    }

    const tokenResponse = await axios.post(tokenUrl, 
      new URLSearchParams({
        code: authCode,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const { access_token, team, authed_user } = tokenResponse.data;

    let integration = await prisma.integration.findFirst({
      where: { userId, integrationType: 'SLACK' },
    });

    if (integration) {
      integration = await prisma.integration.update({
        where: { id: integration.id },
        data: {
          accessToken: encrypt(access_token),
          connectedStatus: true,
          integrationData: {
            teamId: team.id,
            teamName: team.name,
            authedUserId: authed_user.id,
          },
        },
      });
    } else {
      integration = await prisma.integration.create({
        data: {
          userId,
          integrationType: 'SLACK',
          accessToken: encrypt(access_token),
          connectedStatus: true,
          integrationData: {
            teamId: team.id,
            teamName: team.name,
            authedUserId: authed_user.id,
          },
        },
      });
    }

    // Fetch and save Slack data
    // await fetchAndSaveSlackData(userId);

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
              stroke: #4A154B;
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
              <img src="/cofounder.png" alt="cofounder avatar" class="image">
              <svg class="loader" viewBox="0 0 100 100">
                <circle class="loader-circle" cx="50" cy="50" r="45"></circle>
              </svg>
            </div>
            <div class="text">Slack connected successfully</div>
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