require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
// Webhook de Stripe necesita el cuerpo RAW (antes del JSON parser)
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
// Servir el index.html estático
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

    const sessionConfig = {
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: planType === 'lifetime' ? 'payment' : 'subscription',
      success_url: `http://localhost:${PORT}/success.html`,
      cancel_url: `http://localhost:${PORT}/?cancelled=true`,
      // Radar: Fraud protection activo por default en modo test
      radar_options: {}
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
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`🔒 Stripe integrado con Radar (Fraud Detection)`);
  console.log(`📦 Billing (mensual) y Payments (de por vida) listos`);
});
