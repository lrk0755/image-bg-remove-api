// PayPal Order Creation Endpoint
export async function onRequestPost(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pack, userId } = await context.request.json();
    
    // Determine PayPal API base URL based on environment
    const paypalEnv = context.env.PAYPAL_ENV === 'live'
      ? 'api-m.paypal.com'
      : 'api-m.sandbox.paypal.com';
    
    // Credit packs configuration
    const creditPacks = {
      starter: { credits: 10, price: 3.00, name: 'Starter Pack' },
      popular: { credits: 30, price: 6.00, name: 'Popular Pack' },
      power: { credits: 100, price: 15.00, name: 'Power Pack' }
    };
    
    const packInfo = creditPacks[pack];
    if (!packInfo) {
      return new Response(JSON.stringify({ error: 'Invalid pack' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // PayPal API credentials
    const clientId = context.env.PAYPAL_CLIENT_ID;
    const clientSecret = context.env.PAYPAL_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: 'Payment service not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get access token
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenResponse = await fetch(`https://${paypalEnv}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });
    
    if (!tokenResponse.ok) {
      throw new Error('Failed to get PayPal access token');
    }
    
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Create PayPal order
    const orderResponse = await fetch(`https://${paypalEnv}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'PayPal-Request-Id': `ORDER-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          reference_id: pack,
          description: `${packInfo.name} - ${packInfo.credits} credits`,
          amount: {
            currency_code: 'USD',
            value: packInfo.price.toFixed(2)
          },
          custom_id: userId || 'guest'
        }],
        application_context: {
          brand_name: 'AI Background Remover',
          landing_page: 'BILLING',
          user_action: 'PAY_NOW',
          return_url: `${context.env.URL || ''}/pages/pricing.html?payment=success`,
          cancel_url: `${context.env.URL || ''}/pages/pricing.html?payment=cancelled`
        }
      })
    });

    if (!orderResponse.ok) {
      const error = await orderResponse.text();
      console.error('PayPal order creation failed:', error);
      throw new Error('Failed to create PayPal order');
    }

    const orderData = await orderResponse.json();
    
    return new Response(JSON.stringify({
      orderId: orderData.id,
      approveUrl: orderData.links.find(link => link.rel === 'approve').href
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('PayPal error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Capture PayPal order
export async function onRequestPut(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { orderId, userId } = await context.request.json();
    
    if (!orderId) {
      return new Response(JSON.stringify({ error: 'Order ID required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Determine PayPal API base URL based on environment
    const paypalEnv = context.env.PAYPAL_ENV === 'live'
      ? 'api-m.paypal.com'
      : 'api-m.sandbox.paypal.com';
    
    // PayPal API credentials
    const clientId = context.env.PAYPAL_CLIENT_ID;
    const clientSecret = context.env.PAYPAL_CLIENT_SECRET;
    
    // Get access token
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenResponse = await fetch(`https://${paypalEnv}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });
    
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Capture the order
    const captureResponse = await fetch(`https://${paypalEnv}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!captureResponse.ok) {
      const error = await captureResponse.text();
      console.error('PayPal capture failed:', error);
      throw new Error('Payment capture failed');
    }

    const captureData = await captureResponse.json();
    
    // Determine credits based on reference_id
    const referenceId = captureData.purchase_units?.[0]?.reference_id || 'starter';
    const creditPacks = {
      starter: 10,
      popular: 30,
      power: 100
    };
    const credits = creditPacks[referenceId] || 10;

    return new Response(JSON.stringify({
      success: true,
      credits,
      orderId: captureData.id,
      status: captureData.status
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('PayPal capture error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
