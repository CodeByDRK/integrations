import { NextApiRequest, NextApiResponse } from 'next'
import axios from 'axios'
import prisma from '@/lib/prisma'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'
import { decrypt, encrypt } from '../utils/encryption'

async function refreshAsanaToken(refreshToken: string) {
  const tokenUrl = 'https://app.asana.com/-/oauth_token'
  const clientId = process.env.ASANA_INTEGRATION_CLIENT_ID
  const clientSecret = process.env.ASANA_INTEGRATION_CLIENT_SECRET

  try {
    const response = await axios.post(tokenUrl, {
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken
    }, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })

    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresIn: response.data.expires_in
    }
  } catch (error) {
    console.error('Error refreshing Asana token:', error)
    throw new Error('Failed to refresh Asana token')
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const session = await getServerSession(req, res, authOptions)
  if (!session) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  const userId = session.user.id

  try {
    const integration = await prisma.integration.findFirst({
      where: { userId, integrationType: 'ASANA' }
    })

    if (!integration) {
      return res.status(404).json({ error: 'Asana integration not found' })
    }

    let accessToken = decrypt(integration.accessToken!)
    let refreshToken = decrypt(integration.refreshToken!)
    const workspaceId = integration.workSpaceId

    // Check if token is expired
    const now = new Date()
    if (integration.tokenExpiresAt && integration.tokenExpiresAt < now) {
      // Token is expired, refresh it
      const newTokens = await refreshAsanaToken(refreshToken)
      accessToken = newTokens.accessToken
      refreshToken = newTokens.refreshToken

      // Update the database with new tokens
      await prisma.integration.update({
        where: { id: integration.id },
        data: {
          accessToken: encrypt(accessToken),
          refreshToken: encrypt(refreshToken),
          tokenExpiresAt: new Date(Date.now() + newTokens.expiresIn * 1000)
        }
      })
    }

    // Fetch users from Asana
    const response = await axios.get(`https://app.asana.com/api/1.0/workspaces/${workspaceId}/users`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    res.status(200).json(response.data)
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Error fetching users:', error.response?.data || error.message)
      res.status(error.response?.status || 500).json({ error: 'Failed to fetch users', details: error.response?.data })
    } else {
      console.error('Error fetching users:', (error as Error).message)
      res.status(500).json({ error: 'Failed to fetch users' })
    }
  }
}

