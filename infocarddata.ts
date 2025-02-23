import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '../auth/[...nextauth]';
import { CustomUser } from '@/lib/types';

// Define integration categories
const financialIntegrations = ['QUICKBOOKS', 'XERO', 'STRIPE'];
const customerIntegrations = ['SALESFORCE', 'HUBSPOT', 'ZOHO'];

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const user = session.user as CustomUser;
  const userId = user.id;

  try {
    // Fetch all connected integrations for the user
    const connectedIntegrations = await prisma.integration.findMany({
      where: {
        userId: userId,
        connectedStatus: true,
      },
      select: {
        integrationType: true,
      },
    });

    // Check if financial integrations are connected
    const financialConnected = connectedIntegrations.some(integration => 
      financialIntegrations.includes(integration.integrationType)
    );

    // Check if customer integrations are connected
    const customerConnected = connectedIntegrations.some(integration => 
      customerIntegrations.includes(integration.integrationType)
    );

    // Prepare the response data
    const responseData = {
      financialConnected,
      customerConnected,
      financialData: financialConnected ? {
        mrr: 40000,
        burnRate: 50000,
      } : null,
      customerData: customerConnected ? {
        churnRate: 2.5,
      } : null,
    };

    res.status(200).json(responseData);
  } catch (error) {
    console.error('Error fetching integration data:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}