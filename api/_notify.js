// Optional text alert (Twilio) for a new Jarvis request. The email notice is sent from the admin page in the browser, because FormSubmit blocks server requests.
export async function notifyOwner(subject, text) {
  const { TWILIO_SID: sid, TWILIO_TOKEN: tok, TWILIO_FROM: from, NOTIFY_TO: ph } = process.env;
  if (sid && tok && from && ph) {
    await Promise.all(ph.split(',').map(n => n.trim()).filter(Boolean).map(n => fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(sid + ':' + tok).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: from, To: n, Body: (subject + ': ' + text).slice(0, 500) }) }).catch(() => {})));
  }
}
