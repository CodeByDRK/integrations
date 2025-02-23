// import { NextRequest, NextResponse } from 'next/server'
// import Stripe from 'stripe'

// const stripe = new Stripe(process.env.STRIPE_INTEGRATION_CLIENT_SECRET!, {
//   apiVersion: '2023-10-16',
// })

// export async function GET(request: NextRequest) {
//   const searchParams = request.nextUrl.searchParams
//   const code = searchParams.get('code')

//   if (!code) {
//     return NextResponse.json({ error: 'Missing code parameter' }, { status: 400 })
//   }

//   try {
//     const response = await stripe.oauth.token({
//       grant_type: 'authorization_code',
//       code,
//     })

//     // Here, you would typically save the connected account ID to your database
//     const connectedAccountId = response.stripe_user_id

//     // Close the popup and send a message to the parent window
//     return new NextResponse(
//       `<html>
//         <body>
//           <script>
//             window.opener.postMessage({ type: 'STRIPE_CONNECTED', accountId: '${connectedAccountId}' }, '*');
//             window.close();
//           </script>
//         </body>
//       </html>`,
//       {
//         headers: { 'Content-Type': 'text/html' },
//       }
//     )
//   } catch (error) {
//     console.error('Error exchanging OAuth code:', error)
//     return NextResponse.json({ error: 'Failed to exchange OAuth code' }, { status: 500 })
//   }
// }

