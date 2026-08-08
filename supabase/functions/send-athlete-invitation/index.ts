// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY');
const SENDGRID_FROM = Deno.env.get('SENDGRID_FROM');

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
    const { to_email, athlete_name, invitation_url, expires_at } = await req.json();

    if (!to_email || !invitation_url) {
      return new Response('Missing to_email or invitation_url', {
        status: 400,
        headers: corsHeaders,
      });
    }

    const title = athlete_name ? `Hi ${athlete_name},` : 'Hello,';
    const expiry = expires_at ? `This invitation expires at ${expires_at}.` : 'This invitation has a limited validity period.';
    const body = [
      title,
      '',
      'You have been invited to join Birds of Prey Athlete Portal.',
      'Create your account using your invited email address, then sign in.',
      '',
      `Invitation link: ${invitation_url}`,
      expiry,
      '',
      'After sign-in, your account will be linked to your existing athlete profile automatically.',
      '',
      'If you did not expect this invitation, you can ignore this email.',
    ].join('\n');

    await sendEmail(to_email, 'Your Birds of Prey Athlete Invitation', body);

    return new Response('Invitation email sent', { status: 200, headers: corsHeaders });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    return new Response(`Error: ${errorMessage}`, {
      status: 500,
      headers: corsHeaders,
    });
  }
});
