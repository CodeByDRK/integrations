import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../auth/[...nextauth]/route';
import crypto from 'crypto';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const redirectUri = process.env.SLACK_REDIRECT_URI;
  const scope = 'channels:history,channels:read,chat:write,users:read';

  if (!clientId || !redirectUri) {
    console.error('Missing required environment variables');
    return res.status(500).json({ message: 'Server configuration error' });
  }

  const csrfToken = crypto.randomBytes(16).toString('hex');
  const state = JSON.stringify({ csrfToken });

  const authUrl = new URL('https://slack.com/oauth/v2/authorize');
  authUrl.searchParams.append('client_id', clientId);
  authUrl.searchParams.append('redirect_uri', redirectUri);
  authUrl.searchParams.append('scope', scope);
  authUrl.searchParams.append('state', state);

  res.redirect(authUrl.toString());
}

