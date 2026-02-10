import nodemailer from "nodemailer";

let transporter;

const getTransporter = () => {
  if (transporter) return transporter;

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn(
      "[emailService] SMTP config missing (SMTP_HOST/SMTP_USER/SMTP_PASS). Email reminders will be skipped."
    );
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
};

export const sendDailyReminderEmail = async (user, link) => {
  if (!user?.email) return;

  const tx = getTransporter();
  if (!tx) return;

  const to = user.email;
  const name = user.name || "there";

  const subject = "Daily EcoTrack Reminder";
  const addActivityLink = link || process.env.FRONTEND_URL || "http://localhost:3000/add-activity";

  const text = [
    `Hi ${name},`,
    "",
    "Quick daily check-in:",
    "- Did you travel today?",
    "- What food did you eat?",
    "",
    "Open EcoTrack to quickly add today’s activities:",
    addActivityLink,
    "",
    "Thanks for tracking your carbon footprint! 🌱",
  ].join("\n");

  const html = `
    <p>Hi ${name},</p>
    <p>Quick daily check-in:</p>
    <ul>
      <li><strong>Did you travel today?</strong></li>
      <li><strong>What food did you eat?</strong></li>
    </ul>
    <p>
      Open EcoTrack to quickly add today’s activities:<br />
      <a href="${addActivityLink}" target="_blank" rel="noopener noreferrer">${addActivityLink}</a>
    </p>
    <p>Thanks for tracking your carbon footprint! 🌱</p>
  `;

  try {
    await tx.sendMail({
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html,
    });
  } catch (err) {
    console.error("[emailService] Failed to send daily reminder email:", err.message);
  }
};

