/**
 * Email service — uses Resend when RESEND_API_KEY is set,
 * falls back to nodemailer (SMTP_*) or console log in dev.
 */

const logger = require("./logger");

async function sendEmail({ to, from, subject, html, text }) {
  const resendKey = process.env.RESEND_API_KEY;

  if (resendKey) {
    try {
      const { Resend } = require("resend");
      const resend = new Resend(resendKey);
      const { data, error } = await resend.emails.send({
        from: from || process.env.EMAIL_FROM || "noreply@belucha.de",
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        text,
      });
      if (error) throw new Error(error.message);
      logger.info({ emailId: data?.id, to, subject }, "Email sent via Resend");
      return data;
    } catch (err) {
      logger.error({ err, to, subject }, "Resend email failed");
      throw err;
    }
  }

  // Fallback: nodemailer SMTP
  const smtpHost = process.env.SMTP_HOST;
  if (smtpHost) {
    const nodemailer = require("nodemailer");
    const transport = nodemailer.createTransport({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
    const info = await transport.sendMail({
      from: from || process.env.EMAIL_FROM || "noreply@belucha.de",
      to: Array.isArray(to) ? to.join(", ") : to,
      subject,
      html,
      text,
    });
    logger.info({ messageId: info.messageId, to, subject }, "Email sent via SMTP");
    return info;
  }

  // Dev fallback
  logger.info({ to, subject }, "[EMAIL DEV] Email not sent (no provider configured)");
}

module.exports = { sendEmail };
