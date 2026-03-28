// User Registration API
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
    const { id, email, name, avatar, provider } = await context.request.json();
    
    if (!id || !email) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if user exists
    const existing = await context.env.DB.prepare(
      'SELECT * FROM users WHERE id = ?'
    ).bind(id).first();
    
    if (existing) {
      // Update last login
      await context.env.DB.prepare(
        'UPDATE users SET last_login = datetime("now") WHERE id = ?'
      ).bind(id).run();
      
      return new Response(JSON.stringify({
        success: true,
        isNewUser: false,
        user: {
          id: existing.id,
          email: existing.email,
          name: existing.name,
          avatar: existing.avatar,
          credits: existing.credits
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Insert new user with 3 free credits
    await context.env.DB.prepare(
      'INSERT INTO users (id, email, name, avatar, provider, credits) VALUES (?, ?, ?, ?, ?, 3)'
    ).bind(id, email, name || '', avatar || '', provider || 'google').run();
    
    console.log(`New user registered: ${email} with 3 FREE credits`);
    
    return new Response(JSON.stringify({
      success: true,
      isNewUser: true,
      user: {
        id,
        email,
        name: name || '',
        avatar: avatar || '',
        credits: 3
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Registration error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
