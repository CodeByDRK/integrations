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
          integrationType: 'SLACK',
        },
        select: {
          integrationData: true,
          connectedStatus: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!integration) {
        return res.status(404).json({ message: 'Slack integration not found' });
      }

      return res.status(200).json({
        integration: {
          integrationData: integration.integrationData,
          connectedStatus: integration.connectedStatus,
          createdAt: integration.createdAt,
          updatedAt: integration.updatedAt,
        },
      });
    } catch (error: any) {
      console.error('Error fetching Slack integration data:', error);
      return res.status(500).json({
        message: `Internal Server Error: ${error.message}`,
      });
    }
  } else if (req.method === 'DELETE') {
    try {
      await prisma.integration.deleteMany({
        where: {
          userId,
          integrationType: 'SLACK',
        },
      });

      return res.status(200).json({ message: 'Slack integration deleted successfully' });
    } catch (error: any) {
      console.error('Error deleting Slack integration:', error);
      return res.status(500).json({
        message: `Internal Server Error: ${error.message}`,
      });
    }
  }

  return res.status(405).json({ message: 'Method Not Allowed' });
}