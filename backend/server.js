require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Database Connection ───────────────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'shopdb',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

pool.connect((err) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
  } else {
    console.log('✅ Connected to PostgreSQL');
  }
});

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Serve static frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// ─── Helper: Log behavior ──────────────────────────────────────────────────────
async function logBehavior({ sessionId, eventType, productId = null, productName = null, data = {}, pageUrl = '', userAgent = '', ipAddress = '' }) {
  try {
    await pool.query(
      `INSERT INTO app_events.behavior_logs (session_id, event_type, product_id, product_name, data, page_url, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [sessionId, eventType, productId, productName, JSON.stringify(data), pageUrl, userAgent, ipAddress]
    );
  } catch (err) {
    console.error('Log behavior error:', err.message);
  }
}

// ─── Routes: Products ─────────────────────────────────────────────────────────
app.get('/api/products', async (req, res) => {
  try {
    const { category, search } = req.query;
    let query = 'SELECT * FROM app.products WHERE stock > 0';
    const params = [];

    if (category && category !== 'all') {
      params.push(category);
      query += ` AND category = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (name ILIKE $${params.length} OR description ILIKE $${params.length})`;
    }
    query += ' ORDER BY id';

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM app.products WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Product not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Routes: Behavior Logging ─────────────────────────────────────────────────
app.post('/api/track', async (req, res) => {
  const {
    sessionId, eventType, productId, productName,
    data, pageUrl
  } = req.body;

  const userAgent = req.headers['user-agent'] || '';
  const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

  await logBehavior({ sessionId, eventType, productId, productName, data, pageUrl, userAgent, ipAddress });

  // Update session last_seen
  if (sessionId) {
    try {
      await pool.query(
        `INSERT INTO app_events.sessions (id, device_type, referrer, first_seen, last_seen, page_views)
         VALUES ($1, $2, $3, NOW(), NOW(), 1)
         ON CONFLICT (id) DO UPDATE SET last_seen = NOW(), page_views = sessions.page_views + 1`,
        [sessionId, data?.deviceType || 'unknown', data?.referrer || '']
      );
    } catch (e) { /* silent */ }
  }

  res.json({ success: true });
});

// ─── Routes: Orders ───────────────────────────────────────────────────────────
app.post('/api/orders', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const {
      sessionId, customerName, customerEmail, customerPhone,
      shippingAddress, paymentMethod, notes, items, totalAmount
    } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ success: false, error: 'No items in order' });
    }

    // Create order
    const orderResult = await client.query(
      `INSERT INTO app.orders (session_id, customer_name, customer_email, customer_phone,
        shipping_address, payment_method, notes, total_amount, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')
       RETURNING id`,
      [sessionId, customerName, customerEmail, customerPhone,
       shippingAddress, paymentMethod || 'cod', notes, totalAmount]
    );
    const orderId = orderResult.rows[0].id;

    // Insert order items
    for (const item of items) {
      await client.query(
        `INSERT INTO app.order_items (order_id, product_id, product_name, product_price, quantity, subtotal)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [orderId, item.productId, item.productName, item.price, item.quantity, item.price * item.quantity]
      );
      // Decrease stock
      await client.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [item.quantity, item.productId]);
    }

    await client.query('COMMIT');

    // Log checkout complete behavior
    await logBehavior({
      sessionId,
      eventType: 'checkout_complete',
      data: { orderId, totalAmount, itemCount: items.length, paymentMethod },
      userAgent: req.headers['user-agent'] || '',
      ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress || ''
    });

    res.json({ success: true, data: { orderId } });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = await pool.query('SELECT * FROM app.orders WHERE id = $1', [req.params.id]);
    if (!order.rows.length) return res.status(404).json({ success: false, error: 'Order not found' });

    const items = await pool.query('SELECT * FROM app.order_items WHERE order_id = $1', [req.params.id]);
    res.json({ success: true, data: { ...order.rows[0], items: items.rows } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Routes: Admin / Analytics ────────────────────────────────────────────────
app.get('/api/admin/logs', async (req, res) => {
  try {
    const { limit = 50, eventType, sessionId } = req.query;
    let query = 'SELECT * FROM app_events.behavior_logs';
    const params = [];
    const wheres = [];

    if (eventType) { params.push(eventType); wheres.push(`event_type = $${params.length}`); }
    if (sessionId) { params.push(sessionId); wheres.push(`session_id = $${params.length}`); }
    if (wheres.length) query += ' WHERE ' + wheres.join(' AND ');

    params.push(parseInt(limit));
    query += ` ORDER BY created_at DESC LIMIT $${params.length}`;

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/orders', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT o.*, 
        array_agg(json_build_object('name', oi.product_name, 'qty', oi.quantity, 'price', oi.product_price)) as items
      FROM app.orders o
      LEFT JOIN app.order_items oi ON o.id = oi.order_id
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT 100
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/stats', async (req, res) => {
  try {
    const [orders, events, topProducts] = await Promise.all([
      pool.query(`
    SELECT 
    COUNT(*) as total_orders,
    COALESCE(SUM(CASE WHEN status = 'delivered' THEN total_amount ELSE 0 END), 0) as revenue,
    COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders,
    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders
    FROM app.orders WHERE status != 'cancelled'
  `),
      pool.query(`SELECT event_type, COUNT(*) as count FROM app_events.behavior_logs GROUP BY event_type ORDER BY count DESC`),
      pool.query(`SELECT product_name, SUM(quantity) as total_sold FROM app.order_items GROUP BY product_name ORDER BY total_sold DESC LIMIT 5`)
    ]);
    res.json({
      success: true,
      data: {
        orders: orders.rows[0],
        eventBreakdown: events.rows,
        topProducts: topProducts.rows
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


app.get('/api/admin/orders/:id/history', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM app.order_status_history WHERE order_id = $1 ORDER BY changed_at ASC',
      [req.params.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// Cập nhật trạng thái đơn hàng
app.patch('/api/admin/orders/:id/status', async (req, res) => {
  const client = await pool.connect();
  try {
    const { status, note } = req.body;
    const validStatuses = ['pending', 'confirmed', 'delivering', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Trạng thái không hợp lệ' });
    }

    await client.query('BEGIN');

    // Cập nhật trạng thái đơn hàng
    await client.query(
      'UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, req.params.id]
    );

    // Ghi lịch sử
    await client.query(
      'INSERT INTO app.order_status_history (order_id, status, note) VALUES ($1, $2, $3)',
      [req.params.id, status, note || null]
    );

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});


app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});


app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Admin panel: http://localhost:${PORT}/admin.html`);
});

