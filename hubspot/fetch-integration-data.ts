import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '../../auth/[...nextauth]/route';
import { CustomUser } from '@/lib/types';

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const user = session.user as CustomUser;
  const userId = user.id;

  if (req.method === 'GET') {
    try {
      const integration = await prisma.integration.findFirst({
        where: {
          userId,
          integrationType: 'HUBSPOT',
        },
        select: {
          integrationData: true,
          connectedStatus: true,
        },
      });

      if (!integration) {
        return res.status(404).json({ message: 'HubSpot integration not found' });
      }
      return res.status(200).json({
        integrationData: integration.integrationData,
        connectedStatus: integration.connectedStatus,
      });
    } catch (error: any) {
      console.error('Error fetching HubSpot integration data:', error);
      return res.status(500).json({
        message: `Internal Server Error: ${error.message}`,
      });
    }
  }

  return res.status(405).json({ message: 'Method Not Allowed' });
}

