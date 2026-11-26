import nodemailer from 'nodemailer';

/** SMTP mailer (Hostinger Mail: smtp.hostinger.com:465). Without settings, logs instead of sending. */
export function createMailer(cfg) {
  const m = cfg.mail;
  const configured = Boolean(m.host && m.user && m.password && m.from);
  const transport = configured
    ? nodemailer.createTransport({ host: m.host, port: m.port, secure: m.port === 465, auth: { user: m.user, pass: m.password } })
    : null;
  const outbox = [];
  return {
    configured,
    outbox, // inspected by tests when SMTP is not configured
    async send({ to, subject, text }) {
      if (!transport) {
        outbox.push({ to, subject, text });
        if (!cfg.isProd) console.log(`[mail not configured] to=${to} subject=${subject}`);
        return { queued: false };
      }
      await transport.sendMail({ from: m.from, to, subject, text });
      return { queued: true };
    },
  };
}
