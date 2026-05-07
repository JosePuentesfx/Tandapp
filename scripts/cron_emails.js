const cron = require('node-cron');
const pool = require('../config/db');
const mailer = require('../config/mailer');


const startCronJobs = () => {
  // Ejecutar todos los días a las 08:00 AM
  cron.schedule('0 8 * * *', async () => {
    console.log('Ejecutando cron job diario para cobros de tandas...');
    try {
      // Usar el mailer centralizado

      // Obtener todas las rondas pendientes cuya fecha_pago es hoy
      // Se incluye el nombre del miembro y el correo del organizador.
      const query = `
        SELECT 
          r.id as ronda_id,
          r.fecha_pago,
          m.nombre AS miembro_nombre,
          t.nombre AS tanda_nombre,
          u.email AS organizador_email,
          u.nombre AS organizador_nombre
        FROM rondas r
        JOIN miembros m ON m.id = r.miembro_id
        JOIN tandas t ON t.id = r.tanda_id
        JOIN usuarios u ON u.id = t.organizador_id
        WHERE r.estado = 'pendiente'
          AND r.fecha_pago = CURRENT_DATE
      `;

      const result = await pool.query(query);

      for (const ronda of result.rows) {
        if (!ronda.organizador_email) continue;
        
        const mailOptions = {
          from: `"TandApp" <${process.env.EMAIL_USER}>`,
          to: ronda.organizador_email,
          subject: `¡🔔 Hoy hay cobro en tu Tanda!`,
          html: `
            <div style="font-family: sans-serif; padding: 20px;">
              <h2>¡Hola ${ronda.organizador_nombre}!</h2>
              <p>Te recordamos que <strong>hoy</strong> en la tanda <em>"${ronda.tanda_nombre}"</em> le toca cobrar a <strong>${ronda.miembro_nombre}</strong>.</p>
              <br/>
              <p>Por favor asegúrate de recolectar todos los pagos y hacerle llegar su dinero puntual. ¡Puedes marcar la entrega desde la aplicación web!</p>
              <br/>
              <p>Saludos,<br/>El equipo de TandApp</p>
            </div>
          `
        };

        try {
          await mailer.sendMail(mailOptions);
          console.log(`Correo enviado a ${ronda.organizador_email} sobre pago para ${ronda.miembro_nombre}`);
        } catch (mailErr) {
          console.error(`Error enviando correo a ${ronda.organizador_email}:`, mailErr);
        }
      }

    } catch (err) {
      console.error('Error en el proceso del cron:', err);
    }
  });

  console.log('✅ Sistema automático de correos diarios activado.');
};

module.exports = startCronJobs;
