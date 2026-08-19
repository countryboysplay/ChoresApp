import webpush from 'web-push';

/**
 * Prints a fresh VAPID key pair for backend/.env.
 *
 * Generated on the laptop rather than shipped, because the private key is the
 * only thing standing between anyone and the ability to send notifications that
 * arrive on the kids' phones looking like they came from this household.
 *
 * Regenerating invalidates every existing subscription: the push services tie
 * each one to the key that created it. That is recoverable - each phone
 * resubscribes the next time the app is opened - but it means a rotation is not
 * silent, and the reminders that evening may not arrive.
 *
 *   npm run vapid -w backend
 */
const { publicKey, privateKey } = webpush.generateVAPIDKeys();

process.stdout.write(
  [
    'Add these three lines to backend/.env, then restart the server.',
    'VAPID_SUBJECT identifies you to the push services if they need to get in touch;',
    'a real mailbox you read is the point of it.',
    '',
    `VAPID_PUBLIC_KEY=${publicKey}`,
    `VAPID_PRIVATE_KEY=${privateKey}`,
    'VAPID_SUBJECT=mailto:you@example.com',
    '',
    'The private key never leaves the laptop and is never sent to a browser.',
    '',
  ].join('\n'),
);
