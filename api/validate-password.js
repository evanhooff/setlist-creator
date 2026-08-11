export default function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const expectedPassword = (process.env.SETLIST_ADMIN_PASSWORD || '').trim();
  const submittedPassword = (request.body && request.body.password) || '';

  response.setHeader('Cache-Control', 'no-store');

  if (!expectedPassword) {
    response.status(500).json({ error: 'SETLIST_ADMIN_PASSWORD is not configured' });
    return;
  }

  response.status(200).json({
    valid: submittedPassword === expectedPassword
  });
}
