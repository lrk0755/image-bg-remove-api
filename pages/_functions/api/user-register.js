// User Registration API - Creates or updates user in D1
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

    if (!id) {
      return new Response(JSON.stringify({ success: false, error: 'User ID required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Upsert user record
    const existing = await context.env.DB.prepare(
      'SELECT id FROM users WHERE id = ?'
    ).bind(id).first();

    if (existing) {
      // Update existing user
      await context.env.DB.prepare(
        `UPDATE users SET email = ?, name = ?, avatar = ?, updated_at = datetime('now', 'utc')
         WHERE id = ?`
      ).bind(email || null, name || null, avatar || null, id).run();
    } else {
      // Insert new user with 0 credits (new users get free credits via quota system)
      await context.env.DB.prepare(
        `INSERT INTO users (id, email, name, avatar, credits, total_purchased, total_used, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, 0, 0, datetime('now', 'utc'), datetime('now', 'utc'))`
      ).bind(id, email || null, name || null, avatar || null).run();
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('User register error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
