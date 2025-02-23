import { NextApiRequest, NextApiResponse } from 'next'
import axios from 'axios'
import prisma from '@/lib/prisma'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/pages/api/auth/[...nextauth]'
import { decrypt, encrypt } from '../utils/encryption'
import { IncomingForm, Fields, Files } from 'formidable'
import fs from 'fs'

// Disable the default body parser
export const config = {
  api: {
    bodyParser: false,
  },
}

// Function to refresh the Asana access token
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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Check if the user is authenticated
  const session = await getServerSession(req, res, authOptions)
  if (!session) {
    return res.status(401).json({ message: 'Unauthorized' })
  }

  const userId = session.user.id

  try {
    // Fetch the Asana integration for the user
    const integration = await prisma.integration.findFirst({
      where: { userId, integrationType: 'ASANA' }
    })

    if (!integration) {
      return res.status(404).json({ error: 'Asana integration not found' })
    }

    let accessToken = decrypt(integration.accessToken!)
    let refreshToken = decrypt(integration.refreshToken!)
    const workspaceId = integration.workSpaceId

    // Check if token is expired and refresh if necessary
    const now = new Date()
    if (integration.tokenExpiresAt && integration.tokenExpiresAt < now) {
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

    // Parse form data
    const form = new IncomingForm({ keepExtensions: true })
    const [fields, files] = await new Promise<[Fields, Files]>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err)
        else resolve([fields, files])
      })
    })

    console.log('Parsed form data:', JSON.stringify(fields, null, 2))

    const { name, notes, assignee } = fields as { [key: string]: any }

    // Default values
    const defaultTaskName = "Product Roadmap Q1 2025"
    const defaultTaskDescription = "Can you find a feature to increase revenue to 30k MRR."
    const defaultAssignee = "1206977905410088" 

    // Sanitize assignee GID
    let sanitizedAssignee = assignee
    if (typeof assignee === 'string' && assignee.startsWith('gid://')) {
      sanitizedAssignee = assignee.replace('gid://', '')
    }

    // Prepare task data with default values
    const taskData = {
      data: {
        name: String(name || defaultTaskName).trim(),
        notes: String(notes || defaultTaskDescription).trim(),
        workspace: workspaceId,
        assignee: sanitizedAssignee || defaultAssignee,
      },
    }

    console.log('Creating Asana task with data:', JSON.stringify(taskData, null, 2))

    // Create task in Asana
    const taskResponse = await axios.post('https://app.asana.com/api/1.0/tasks', taskData, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    console.log('Asana task created:', JSON.stringify(taskResponse.data, null, 2))

    const taskId = taskResponse.data.data.gid

    // Handle file attachment
    if (files.attachment && !Array.isArray(files.attachment)) {
      const file = files.attachment
      const fileContent = fs.readFileSync(file.filepath)
      const fileName = file.originalFilename || 'attachment'

      console.log('Uploading attachment:', fileName)

      await axios.post(
        `https://app.asana.com/api/1.0/tasks/${taskId}/attachments`,
        fileContent,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': file.mimetype || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${fileName}"`,
          },
        }
      )

      console.log('Attachment uploaded successfully')

      // Delete the temporary file
      fs.unlinkSync(file.filepath)
    }

    res.status(200).json({ success: true, taskId })
  } catch (error) {
    console.error('Error creating Asana task:', error)
    if (axios.isAxiosError(error)) {
      console.error('Axios error details:', error.response?.data)
      res.status(error.response?.status || 500).json({ 
        error: 'Failed to create Asana task', 
        details: error.response?.data || error.message 
      })
    } else {
      res.status(500).json({ error: 'Failed to create Asana task', details: String(error) })
    }
  }
}

