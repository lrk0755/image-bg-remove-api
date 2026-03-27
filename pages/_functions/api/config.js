// Config endpoint - returns public configuration
export async function onRequestGet(context) {
  return new Response(JSON.stringify({
    paypalClientId: context.env.PAYPAL_CLIENT_ID || '',
    apiBase: context.env.API_BASE || ''
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
