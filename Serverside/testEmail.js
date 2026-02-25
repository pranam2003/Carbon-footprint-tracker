import dotenv from 'dotenv';
dotenv.config();

import { sendVerificationEmail } from './services/emailService.js';

console.log("--- Test Email Script ---");
console.log("Current working directory:", process.cwd());
console.log("SMTP_USER:", process.env.SMTP_USER ? "Present" : "Missing");
console.log("SMTP_PASS:", process.env.SMTP_PASS ? "Present" : "Missing");
console.log("SMTP_HOST:", process.env.SMTP_HOST);
console.log("SMTP_PORT:", process.env.SMTP_PORT);

const testEmail = process.env.SMTP_USER; // Send to self

if (!testEmail) {
    console.error("Cannot run test: SMTP_USER is missing in .env");
    process.exit(1);
}

console.log(`Attempting to send email to ${testEmail}...`);

try {
    await sendVerificationEmail(testEmail, "123456");
    console.log("Test finished.");
} catch (error) {
    console.error("Test failed with error:", error);
}
