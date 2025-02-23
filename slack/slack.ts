import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import prisma from '@/lib/prisma';
import { authOptions } from '../../auth/[...nextauth]';
import { CustomUser } from '@/lib/types';
import { decrypt } from '../utils/encryption';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const user = session.user as CustomUser;
  const userId = user.id;

  if (req.method === 'GET') {
    try {
      const integration = await prisma.integration.findFirst({
        where: { userId, integrationType: 'SLACK' },
      });

      if (integration) {
        // Decrypt sensitive data before sending
        integration.accessToken = decrypt(integration.accessToken!);

        // Extract Slack data from integrationData
        const slackData = integration.integrationData;

        return res.status(200).json({ integration, slackData });
      }

      return res.status(404).json({ message: 'Slack integration not found' });
    } catch (error: any) {
      console.error('Error fetching Slack integration:', error);
      return res.status(500).json({ message: `Internal Server Error: ${error.message}` });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await prisma.integration.deleteMany({
        where: { userId, integrationType: 'SLACK' },
      });

      return res.status(200).json({ message: 'Slack integration deleted successfully' });
    } catch (error: any) {
      console.error('Error deleting Slack integration:', error);
      return res.status(500).json({ message: `Internal Server Error: ${error.message}` });
    }
  }

  return res.status(405).json({ message: 'Method Not Allowed' });
}