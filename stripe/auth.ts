// import { NextResponse } from 'next/server'
// import Stripe from 'stripe'

// const stripe = new Stripe(process.env.STRIPE_INTEGRATION_CLIENT_SECRET!, {
//   apiVersion: '2023-10-16',
// })

// export async function POST() {
//   try {
//     const connectAccountUrl = await stripe.oauth.authorizeUrl({
//       client_id: process.env.STRIPE_INTEGRATION_CLIENT_ID!,
//       response_type: 'code',
//       scope: 'read_write',
//       redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/stripe/callback`,
//     })

//     return NextResponse.json({ url: connectAccountUrl })
//   } catch (error) {
//     console.error('Error creating Stripe connect URL:', error)
//     return NextResponse.json({ error: 'Failed to create Stripe connect URL' }, { status: 500 })
//   }
// }

