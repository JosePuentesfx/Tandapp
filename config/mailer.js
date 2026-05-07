const https = require('https');

/**
 * Mailer service using Brevo HTTP API
 * This bypasses SMTP port blocking on Render.
 */
const mailer = {
  sendMail: (options) => {
    return new Promise((resolve, reject) => {
      // Prepare data for Brevo API v3
      const data = JSON.stringify({
        sender: { 
          name: 'TandApp', 
          email: process.env.EMAIL_USER || 'tandapp.oficial@gmail.com' 
        },
        to: [{ email: options.to }],
        subject: options.subject,
        htmlContent: options.html
      });

      const reqOptions = {
        hostname: 'api.brevo.com',
        path: '/v3/smtp/email',
        method: 'POST',
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'content-type': 'application/json',
          'accept': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };

      const req = https.request(reqOptions, (res) => {
        let responseBody = '';
        res.on('data', (chunk) => { responseBody += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`✅ Email enviado exitosamente a ${options.to} via API`);
            resolve({ messageId: JSON.parse(responseBody).messageId });
          } else {
            console.error('❌ Error de Brevo API:', res.statusCode, responseBody);
            reject(new Error(`Brevo API responded with ${res.statusCode}`));
          }
        });
      });

      req.on('error', (err) => {
        console.error('❌ Error de red contactando a Brevo API:', err);
        reject(err);
      });

      req.write(data);
      req.end();
    });
  }
};

module.exports = mailer;