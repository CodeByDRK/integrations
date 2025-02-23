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
      error_description: req.query.error_description,
    });
  }

  const authCode = req.query.code as string;

  if (!authCode) {
    return res.status(400).json({ message: 'Missing required parameters' });
  }

  try {
    const tokenUrl = 'https://api.hubapi.com/oauth/v1/token';
    const redirectUri = process.env.HUBSPOT_REDIRECT_URI;
    const clientId = process.env.HUBSPOT_INTEGRATION_CLIENT_ID;
    const clientSecret = process.env.HUBSPOT_INTEGRATION_CLIENT_SECRET;

    if (!redirectUri || !clientId || !clientSecret) {
      throw new Error('Missing required environment variables');
    }

    const tokenResponse = await axios.post(
      tokenUrl,
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code: authCode,
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const { access_token, refresh_token, expires_in, hub_domain } = tokenResponse.data;

    // Fetch data for the past 12 months
    const hubspotData = [];
    for (let i = 0; i < 12; i++) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const startDate = new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
      const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0).toISOString().split('T')[0];
      const month = date.toLocaleString('default', { month: 'long' });
      const year = date.getFullYear();

      try {
        // Log date range
        console.log(`Fetching data for: ${month} ${year} (${startDate} to ${endDate})`);

        // Fetch data from HubSpot APIs
        const userGrowthResponse = await axios.get(
          `https://api.hubapi.com/crm/v3/objects/contacts?createdAfter=${startDate}&createdBefore=${endDate}`,
          { headers: { Authorization: `Bearer ${access_token}` } }
        );
        console.log('User Growth Response:', userGrowthResponse.data);

        const retentionResponse = await axios.get(
          `https://api.hubapi.com/analytics/v2/reports/${hub_domain}/metrics/retention`,
          { headers: { Authorization: `Bearer ${access_token}` } }
        );
        console.log('Retention Response:', retentionResponse.data);

        const churnRateResponse = await axios.get(
          `https://api.hubapi.com/analytics/v2/reports/${hub_domain}/metrics/churn`,
          { headers: { Authorization: `Bearer ${access_token}` } }
        );
        console.log('Churn Rate Response:', churnRateResponse.data);

        const referralRateResponse = await axios.get(
          `https://api.hubapi.com/analytics/v2/reports/${hub_domain}/metrics/referrals`,
          { headers: { Authorization: `Bearer ${access_token}` } }
        );
        console.log('Referral Rate Response:', referralRateResponse.data);

        const leadConversionResponse = await axios.get(
          `https://api.hubapi.com/crm/v3/objects/deals?createdAfter=${startDate}&createdBefore=${endDate}`,
          { headers: { Authorization: `Bearer ${access_token}` } }
        );
        console.log('Lead Conversion Response:', leadConversionResponse.data);

        hubspotData.push({
          month,
          year,
          metrics: {
            userGrowth: userGrowthResponse.data.total || 0,
            retentionRate: retentionResponse.data.value || 0,
            churnRate: churnRateResponse.data.value || 0,
            referralRate: referralRateResponse.data.value || 0,
            demos: leadConversionResponse.data.total || 0,
            leadConversions: leadConversionResponse.data.total || 0,
          },
        });
      } catch (error) {
        console.error(
          `Error fetching data for ${month} ${year}:`,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    }

    let integration = await prisma.integration.findFirst({
      where: { userId, integrationType: 'HUBSPOT' },
    });

    if (integration) {
      integration = await prisma.integration.update({
        where: { id: integration.id },
        data: {
          accessToken: encrypt(access_token),
          refreshToken: encrypt(refresh_token),
          tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
          instanceUrl: hub_domain,
          connectedStatus: true,
          integrationData: hubspotData,
        },
      });
    } else {
      integration = await prisma.integration.create({
        data: {
          userId,
          integrationType: 'HUBSPOT',
          accessToken: encrypt(access_token),
          refreshToken: encrypt(refresh_token),
          tokenExpiresAt: new Date(Date.now() + expires_in * 1000),
          instanceUrl: hub_domain,
          connectedStatus: true,
          integrationData: hubspotData,
        },
      });
    }

    res.send(`
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; }
          </style>
        </head>
        <body>
          <h1>HubSpot Connected Successfully</h1>
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
