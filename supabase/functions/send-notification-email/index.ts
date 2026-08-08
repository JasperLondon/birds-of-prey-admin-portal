// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY');
const SENDGRID_FROM = Deno.env.get('SENDGRID_FROM');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sendEmail(to: string, subject: string, text: string) {
  if (!SENDGRID_API_KEY || !SENDGRID_FROM) {
    throw new Error('Missing SENDGRID_API_KEY or SENDGRID_FROM secret');
  }

  const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: SENDGRID_FROM },
      subject,
      content: [{ type: 'text/plain', value: text }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`SendGrid error: ${err}`);
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY secret');
    }

    const { athlete_id, message, subject } = await req.json();

    if (!athlete_id || !message) {
      return new Response('Missing athlete_id or message', {
        status: 400,
        headers: corsHeaders,
      });
    }

    const url = `${SUPABASE_URL}/rest/v1/athletes?id=eq.${athlete_id}&select=email`;
    const athleteResp = await fetch(url, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });

    if (!athleteResp.ok) {
      const err = await athleteResp.text();
      throw new Error(`Failed to load athlete email: ${err}`);
    }

    const athletes = await athleteResp.json();
    const email = athletes?.[0]?.email;

    if (!email) {
      return new Response('No email for athlete', { status: 400, headers: corsHeaders });
    }

    await sendEmail(email, subject || 'MWD Calendar Notification', message);

    return new Response('Email sent', { status: 200, headers: corsHeaders });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return new Response(`Error: ${errorMessage}`, {
      status: 500,
      headers: corsHeaders,
    });
  }
});
