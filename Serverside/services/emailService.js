// import nodemailer from 'nodemailer';
// import dotenv from 'dotenv';
// dotenv.config();

// console.log("DEBUG: Loading Email Service...");
// console.log("DEBUG: SMTP_USER Present:", !!process.env.SMTP_USER);
// console.log("DEBUG: SMTP_PASS Present:", !!process.env.SMTP_PASS);

// const smtpUser = process.env.SMTP_USER;
// // Remove spaces from the password if present (Google App Passwords often have spaces)
// const smtpPass = process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, '') : '';

// const transporter = nodemailer.createTransport({
//   host: process.env.SMTP_HOST || 'smtp.gmail.com',
//   port: process.env.SMTP_PORT || 587,
//   secure: process.env.SMTP_SECURE === 'true',
//   auth: {
//     user: smtpUser,
//     pass: smtpPass,
//   },
// });

// if (!smtpUser || !smtpPass) {
//   console.error("CRITICAL ERROR: SMTP_USER or SMTP_PASS is missing in .env file.");
// }

// export const sendVerificationEmail = async (email, token) => {
//   const mailOptions = {
//     from: process.env.EMAIL_FROM || process.env.SMTP_USER,
//     to: email,
//     subject: 'Verify your email for Carbon Footprint Tracker',
//     html: `
//       <h1>Email Verification</h1>
//       <p>Please use the following code to verify your email address:</p>
//       <h2>${token}</h2>
//       <p>This code will expire in 15 minutes.</p>
//     `,
//   };

//   try {
//     await transporter.sendMail(mailOptions);
//     console.log('Verification email sent to:', email);
//   } catch (error) {
//     console.error('Error sending email:', error);
//     throw new Error('Could not send verification email');
//   }
// };

// export const sendDailyReminderEmail = async (user, link) => {
//   const mailOptions = {
//     from: process.env.EMAIL_USER,
//     to: user.email,
//     subject: "Daily Reminder: Log Your Carbon Footprint",
//     html: `
//       <h1>Hello ${user.name},</h1>
//       <p>This is your daily reminder to log your activities for today.</p>
//       <p>Tracking your carbon footprint helps you stay aware of your impact on the environment.</p>
//       <a href="${link}" style="display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px;">Log Activity</a>
//       <p>Or click here: <a href="${link}">${link}</a></p>
//     `,
//   };

//   try {
//     await transporter.sendMail(mailOptions);
//     console.log("Daily reminder email sent to:", user.email);
//   } catch (error) {
//     console.error("Error sending daily reminder email:", error);
//   }
// };
import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();


let transporter = null;

const createTransporter = () => {
  if (transporter) return transporter;

  // Check required env values
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error("❌ SMTP_USER or SMTP_PASS missing in .env file");
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true", // false for port 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS.replace(/\s+/g, ""), // remove spaces
    },
  });

  return transporter;
};



export const sendVerificationEmail = async (email, otp) => {
  const tx = createTransporter();
  if (!tx) return;

  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: email,
    subject: "Verify Your Email - EcoTrack 🌍",
    html: `
      <div style="font-family: Arial; padding: 20px;">
        <h2>EcoTrack Email Verification</h2>
        <p>Thank you for registering!</p>
        <p>Your verification code is:</p>

        <h1 style="color: green;">${otp}</h1>

        <p>This OTP will expire in <b>15 minutes</b>.</p>

        <p>If you did not request this, ignore this email.</p>

        <br/>
        <p>🌱 EcoTrack Team</p>
      </div>
    `,
  };

  try {
    await tx.sendMail(mailOptions);
    console.log("✅ Verification email sent to:", email);
  } catch (error) {
    console.error("❌ Error sending verification email:", error.message);
    throw new Error("Could not send verification email");
  }
};



export const sendDailyReminderEmail = async (user, link) => {
  const tx = createTransporter();
  if (!tx) return;

  if (!user?.email) return;

  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: user.email,
    subject: "Daily Reminder 🌱 Log Your Carbon Activities",
    html: `
      <div style="font-family: Arial; padding: 20px;">
        <h2>Hello ${user.name || "Eco User"} 👋</h2>

        <p>This is your daily reminder to log today’s activities.</p>

        <p>Tracking helps you reduce your carbon footprint 🌍</p>

        <a href="${link}"
           style="display:inline-block;
                  padding:12px 20px;
                  background:green;
                  color:white;
                  text-decoration:none;
                  border-radius:6px;
                  margin-top:10px;">
          ➕ Add Activity Now
        </a>

        <p style="margin-top:20px;">
          Or open this link manually:<br/>
          <a href="${link}">${link}</a>
        </p>

        <br/>
        <p>Thanks for supporting the planet 🌱</p>
        <p><b>EcoTrack Team</b></p>
      </div>
    `,
  };

  try {
    await tx.sendMail(mailOptions);
    console.log("✅ Daily reminder sent to:", user.email);
  } catch (error) {
    console.error("❌ Error sending reminder email:", error.message);
  }
};
