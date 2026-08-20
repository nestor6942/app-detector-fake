require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
// Webhook de Stripe necesita el cuerpo RAW (antes del JSON parser)
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
// Servir el index.html estático
// Ruta raíz: inyecta la API KEY de Firebase desde variables de entorno para evitar exponerla en el repositorio
app.get('/', (req, res) => {
  try {
    const indexPath = path.join(__dirname, 'index.html');
    let html = fs.readFileSync(indexPath, 'utf8');

    const firebaseApiKey = process.env.FIREBASE_API_KEY || '';
    html = html.replace(/__FIREBASE_API_KEY__/g, firebaseApiKey);

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    console.error('Error leyendo index.html para inyección:', err);
    res.status(500).send('Error interno');
  }
});

// Servir archivos estáticos restantes (JS, CSS, assets)
app.use(express.static(path.join(__dirname)));

// ─── POST /create-checkout-session ───────────────────────────────────────────
// Crea una sesión de pago en Stripe (mensual o único)
app.post('/create-checkout-session', async (req, res) => {
  const { planType } = req.body; // 'monthly' | 'lifetime'

  try {
    const lineItems =
      planType === 'lifetime'
        ? [{
            price_data: {
              currency: 'mxn',
              product_data: {
                name: 'Plan Pro — Acceso de por vida',
                description: 'Detector de Cuentas Falsas — Sin límites de consultas.',
                images: []
              },
              unit_amount: 29900 // $299 MXN
            },
            quantity: 1
          }]
        : [{
            price_data: {
              currency: 'mxn',
              product_data: {
                name: 'Plan Pro — Suscripción Mensual',
                description: 'Detector de Cuentas Falsas — Consultas ilimitadas cada mes.',
                images: []
              },
              unit_amount: 9900, // $99 MXN/mes
              recurring: { interval: 'month' }
            },
            quantity: 1
          }];

    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const baseUrl = process.env.BASE_URL || `${protocol}://${host}`;

    const sessionConfig = {
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: planType === 'lifetime' ? 'payment' : 'subscription',
      success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/?cancelled=true`
    };

    if (planType !== 'lifetime') {
      sessionConfig.subscription_data = {
        metadata: { plan: 'pro_monthly' }
      };
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);
    res.json({ url: session.url });
  } catch (err) {
    console.error('Error creando sesión de Stripe:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /webhook ────────────────────────────────────────────────────────────
// Stripe nos notifica aquí cuando un pago es exitoso
app.post('/webhook', (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      console.log('✅ Pago exitoso. Customer:', session.customer_email || session.customer);
      // NOTA: Aquí puedes marcar isPro=true en Firestore usando Firebase Admin SDK
      // con el UID del usuario guardado en session.metadata.uid
      break;
    case 'customer.subscription.deleted':
      console.log('❌ Suscripción cancelada:', event.data.object.id);
      // Aquí puedes marcar isPro=false en Firestore
      break;
    default:
      console.log(`Evento recibido: ${event.type}`);
  }

  res.json({ received: true });
});

// ─── GET /config ──────────────────────────────────────────────────────────────
// Expone solo la clave PÚBLICA al frontend (nunca la secreta)
app.get('/config', (req, res) => {
  res.json({ publicKey: process.env.STRIPE_PUBLIC_KEY });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT} y http://127.0.0.1:${PORT}`);
  console.log(`🔒 Stripe integrado con Radar (Fraud Detection)`);
  console.log(`📦 Billing (mensual) y Payments (de por vida) listos`);
});
