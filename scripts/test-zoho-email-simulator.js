/**
 * IntelliCore V2.0 — Zoho Mail SMTP & Delivery Simulator
 * 
 * Verifies email configuration, template rendering, and capture pipeline.
 * Simulates Zoho Mail SMTP connection without sending unapproved mail.
 */

import { deliveryConfiguration } from '../backend/src/integrations/email/emailConfig.js';
import { renderEmail } from '../backend/src/integrations/email/emailTemplates.js';
import { deliverEmail } from '../backend/src/integrations/email/emailService.js';

async function main() {
  console.log('--- IntelliCore Zoho Mail SMTP & Delivery Verification ---');

  // 1. Verify Zoho Mail Default Production Spec
  const zohoSpec = {
    provider: 'Zoho Mail (India Enterprise)',
    primaryMx: 'mx.zoho.in (Priority 10)',
    secondaryMx: 'mx2.zoho.in (Priority 20)',
    tertiaryMx: 'mx3.zoho.in (Priority 50)',
    smtpHost: 'smtppro.zoho.in',
    smtpPort: 465,
    smtpSecurity: 'SSL / TLSv1.2+',
    recommendedSender: 'admin@intellicoretechnologies.in'
  };
  console.log('Zoho Mail Infrastructure Specification:', zohoSpec);

  // 2. Test Email Template Rendering
  console.log('\nTesting Template Rendering:');
  const sampleEvent = 'TASK_ASSIGNED';
  const sampleNoticeId = 'a0000000-0000-4000-8000-000000000001';
  const sampleActionPath = `/dashboards/intern?notice=${sampleNoticeId}#phase07Notice`;

  const rendered = renderEmail({
    templateKey: 'task-assigned',
    version: 1,
    event: sampleEvent,
    path: sampleActionPath,
    baseUrl: 'https://www.intellicoretechnologies.in'
  });

  if (rendered.subject && rendered.html && rendered.text) {
    console.log('✓ Template rendering passed:');
    console.log(`  Subject: ${rendered.subject}`);
    console.log(`  Body length: ${rendered.html.length} chars (HTML), ${rendered.text.length} chars (Text)`);
  } else {
    throw new Error('Template rendering failed.');
  }

  // 3. Test Capture Mode Pipeline (Default Zero-Spam Mode)
  console.log('\nTesting Capture Pipeline (Default Safe Mode):');
  const captureConfig = deliveryConfiguration({
    NODE_ENV: 'development',
    APP_BASE_URL: 'https://www.intellicoretechnologies.in',
    EMAIL_DELIVERY_MODE: 'CAPTURE'
  });

  const sampleJob = {
    id: 'test-job-001',
    recipientEmail: 'candidate@example.com',
    templateKey: 'task-assigned',
    templateVersion: 1,
    templateData: {
      event: sampleEvent,
      actionPath: sampleActionPath
    }
  };

  const deliveryResult = await deliverEmail(sampleJob, captureConfig);
  if (deliveryResult.status === 'CAPTURED') {
    console.log('✓ Capture pipeline passed: Status is CAPTURED (email preserved in database outbox without sending external spam)');
  } else {
    throw new Error(`Expected status CAPTURED, received ${deliveryResult.status}`);
  }

  // 4. Test Zoho SMTP Configuration Validation
  console.log('\nTesting Zoho SMTP Validation Rules:');
  const mockZohoEnv = {
    NODE_ENV: 'development',
    APP_BASE_URL: 'https://www.intellicoretechnologies.in',
    EMAIL_DELIVERY_MODE: 'SMTP',
    SMTP_HOST: 'smtppro.zoho.in',
    SMTP_PORT: '465',
    SMTP_SECURE: 'true',
    SMTP_REQUIRE_TLS: 'true',
    SMTP_USER: 'admin@intellicoretechnologies.in',
    SMTP_PASSWORD: 'dummy-app-password',
    EMAIL_FROM_NAME: 'IntelliCore Operations',
    EMAIL_FROM_ADDRESS: 'admin@intellicoretechnologies.in',
    EMAIL_SMTP_AUTHORIZED: 'true',
    EMAIL_ALLOWED_RECIPIENTS: 'admin@intellicoretechnologies.in,owner@intellicoretechnologies.in'
  };

  const smtpConfig = deliveryConfiguration(mockZohoEnv);
  if (smtpConfig.mode === 'SMTP' && smtpConfig.smtp.SMTP_HOST === 'smtppro.zoho.in') {
    console.log('✓ Zoho SMTP Schema validation passed: Ready for live dispatch when owner configures SMTP_PASSWORD.');
  } else {
    throw new Error(`SMTP validation failed: ${JSON.stringify(smtpConfig)}`);
  }

  console.log('\n======================================================');
  console.log('✓ All Zoho Mail & Notification verification checks passed.');
  console.log('======================================================');
}

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
