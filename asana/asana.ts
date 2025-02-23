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
        where: { userId, integrationType: 'ASANA' },
      });

      if (integration) {
        // Decrypt sensitive data before sending
        integration.accessToken = decrypt(integration.accessToken!);
        integration.refreshToken = decrypt(integration.refreshToken!);

        // Extract Asana data from integrationData
        const asanaData = integration.integrationData;

        return res.status(200).json({ integration, asanaData });
      }

      return res.status(404).json({ message: 'Asana integration not found' });
    } catch (error: any) {
      console.error('Error fetching Asana integration:', error);
      return res.status(500).json({ message: `Internal Server Error: ${error.message}` });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await prisma.integration.deleteMany({
        where: { userId, integrationType: 'ASANA' },
      });

      return res.status(200).json({ message: 'Asana integration deleted successfully' });
    } catch (error: any) {
      console.error('Error deleting Asana integration:', error);
      return res.status(500).json({ message: `Internal Server Error: ${error.message}` });
    }
  }

  return res.status(405).json({ message: 'Method Not Allowed' });
}