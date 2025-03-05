import { NextResponse } from "next/server";
import axios from "axios";
import prisma from "@/lib/prisma";
import { stackServerApp } from '@/stack';

interface CreateTaskRequest {
  name: string;
  notes: string;
  tags: string[];
}

export async function POST(req: Request) {
  console.log('🟡 [Asana Create Task] Processing POST request...');

  try {
    // Get authenticated user
    console.log('🔍 [Asana Create Task] Getting user...');
    const user = await stackServerApp.getUser();
    console.log('👤 [Asana Create Task] User:', user?.id || 'Not found');
    
    if (!user?.id) {
      console.log('❌ [Asana Create Task] User not authenticated');
      return NextResponse.json(
        { error: "User not authenticated" },
        { status: 401 }
      );
    }

    // Get Asana integration
    console.log('🔍 [Asana Create Task] Getting Asana integration...');
    const integration = await prisma.integration.findFirst({
      where: {
        userId: user.id,
        integrationType: "ASANA",
        connectedStatus: true,
      },
    });

    if (!integration || !integration.accessToken) {
      console.log('❌ [Asana Create Task] No Asana integration found');
      return NextResponse.json(
        { error: "Asana integration not found" },
        { status: 404 }
      );
    }

    // Check if token is expired
    if (integration.tokenExpiresAt && new Date() > integration.tokenExpiresAt) {
      console.log('❌ [Asana Create Task] Token expired');
      return NextResponse.json(
        { error: "Asana token expired" },
        { status: 401 }
      );
    }

    // Get request body
    const body: CreateTaskRequest = await req.json();
    
    // Get workspace
    console.log('🔄 [Asana Create Task] Fetching workspace...');
    const workspacesResponse = await axios.get(
      'https://app.asana.com/api/1.0/workspaces',
      {
        headers: { 
          'Authorization': `Bearer ${integration.accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!workspacesResponse.data.data?.[0]?.gid) {
      throw new Error('No workspace found');
    }

    const workspaceGid = workspacesResponse.data.data[0].gid;

    // Create task
    console.log('🔄 [Asana Create Task] Creating task...');
    const taskResponse = await axios.post(
      'https://app.asana.com/api/1.0/tasks',
      {
        data: {
          name: body.name,
          notes: body.notes,
          workspace: workspaceGid,
          assignee: 'me'
        }
      },
      {
        headers: { 
          'Authorization': `Bearer ${integration.accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    const taskGid = taskResponse.data.data.gid;

    // Add tags if provided
    if (body.tags && body.tags.length > 0) {
      console.log('🔄 [Asana Create Task] Adding tags...');
      
      // Get or create tags
      for (const tagName of body.tags) {
        try {
          // Try to create new tag
          const tagResponse = await axios.post(
            'https://app.asana.com/api/1.0/workspaces/' + workspaceGid + '/tags',
            {
              data: {
                name: tagName
              }
            },
            {
              headers: { 
                'Authorization': `Bearer ${integration.accessToken}`,
                'Accept': 'application/json'
              }
            }
          );

          // Add tag to task
          await axios.post(
            'https://app.asana.com/api/1.0/tasks/' + taskGid + '/addTag',
            {
              data: {
                tag: tagResponse.data.data.gid
              }
            },
            {
              headers: { 
                'Authorization': `Bearer ${integration.accessToken}`,
                'Accept': 'application/json'
              }
            }
          );
        } catch (error) {
          // Tag might already exist, try to find and add it
          try {
            const tagsResponse = await axios.get(
              'https://app.asana.com/api/1.0/workspaces/' + workspaceGid + '/tags',
              {
                headers: { 
                  'Authorization': `Bearer ${integration.accessToken}`,
                  'Accept': 'application/json'
                }
              }
            );

            const existingTag = tagsResponse.data.data.find(
              (tag: any) => tag.name.toLowerCase() === tagName.toLowerCase()
            );

            if (existingTag) {
              await axios.post(
                'https://app.asana.com/api/1.0/tasks/' + taskGid + '/addTag',
                {
                  data: {
                    tag: existingTag.gid
                  }
                },
                {
                  headers: { 
                    'Authorization': `Bearer ${integration.accessToken}`,
                    'Accept': 'application/json'
                  }
                }
              );
            }
          } catch (tagError) {
            console.error('Error adding tag:', tagError);
            // Continue with next tag
          }
        }
      }
    }

    console.log('✅ [Asana Create Task] Task created successfully:', {
      name: body.name,
      tags: body.tags
    });

    return NextResponse.json({
      success: true,
      data: taskResponse.data.data
    });

  } catch (error: any) {
    const errorDetails = {
      message: error.message || "Unknown error",
      response: error.response?.data,
      stack: error.stack,
      code: error.code
    };
    console.error('❌ [Asana Create Task] Error:', JSON.stringify(errorDetails, null, 2));
    return NextResponse.json(
      { 
        success: false,
        error: "Failed to create Asana task",
        details: error.response?.data?.errors?.[0]?.message || error.message
      },
      { status: 500 }
    );
  }
}
