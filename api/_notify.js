// Tells the owner a new Jarvis request came in. Email through FormSubmit, optional text through Twilio. Both are best-effort.
export async function notifyOwner(subject, text) {
  const to = process.env.JARVIS_NOTIFY_EMAIL || 'bahmed3170@gmail.com';
  try {
    await fetch('https://formsubmit.co/ajax/' + to, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://www.junkjunkiesindiana.com', Referer: 'https://www.junkjunkiesindiana.com/admin/' },
      body: JSON.stringify({ _subject: subject, _template: 'table', _captcha: 'false', message: text }) });
  } catch (e) { console.error('notify email failed'); }
  const { TWILIO_SID: sid, TWILIO_TOKEN: tok, TWILIO_FROM: from, NOTIFY_TO: ph } = process.env;
  if (sid && tok && from && ph) {
    await Promise.all(ph.split(',').map(n => n.trim()).filter(Boolean).map(n => fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(sid + ':' + tok).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: from, To: n, Body: (subject + ': ' + text).slice(0, 500) }) }).catch(() => {})));
  }
}
