// Admin Stats API
export async function onRequestGet(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get all stats from D1
    const totalUsers = await context.env.DB.prepare(
      'SELECT COUNT(*) as count FROM users'
    ).first();
    
    const totalCredits = await context.env.DB.prepare(
      'SELECT COALESCE(SUM(credits), 0) as total FROM payments'
    ).first();
    
    const totalRevenue = await context.env.DB.prepare(
      'SELECT COALESCE(SUM(amount), 0) as total FROM payments'
    ).first();
    
    const recentPayments = await context.env.DB.prepare(
      'SELECT p.*, u.email FROM payments p LEFT JOIN users u ON p.user_id = u.id ORDER BY p.created_at DESC LIMIT 20'
    ).all();
    
    const recentUsers = await context.env.DB.prepare(
      'SELECT id, email, name, credits, total_purchased, total_used, created_at FROM users ORDER BY created_at DESC LIMIT 50'
    ).all();
    
    return new Response(JSON.stringify({
      totalUsers: totalUsers?.count || 0,
      totalCreditsSold: totalCredits?.total || 0,
      totalRevenue: totalRevenue?.total || 0,
      guestTrials: 0, // Would need KV tracking for this
      payments: recentPayments?.results || [],
      users: recentUsers?.results || []
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Admin stats error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
