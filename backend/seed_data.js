require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'shopdb',
  user:     process.env.DB_USER     || 'web_admin',
  password: process.env.DB_PASSWORD || 'web_admin123',
});

const names = ['Nguyễn Thành Đạt','Trần Minh Khoa','Lê Thị Hoa','Phạm Quốc Bảo','Hoàng Thị Lan','Vũ Đức Anh','Đặng Thị Mai','Bùi Văn Hùng','Đỗ Thị Thu','Ngô Minh Tuấn','Phan Thị Ngọc','Lý Văn Thắng','Trương Thị Bích','Đinh Quang Hải','Mai Thị Cúc'];
const phones = () => '09' + Math.floor(10000000 + Math.random()*89999999);
const emails = (name) => name.toLowerCase().replace(/\s/g,'') + Math.floor(Math.random()*999) + '@gmail.com';
const addresses = ['123 Nguyễn Huệ, Q1, TP.HCM','456 Lê Lợi, Q3, TP.HCM','789 Trần Hưng Đạo, Q5, TP.HCM','12 Đinh Tiên Hoàng, Bình Thạnh','34 Võ Văn Tần, Q3, TP.HCM','90 Pasteur, Q1, TP.HCM','67 Hai Bà Trưng, Q1, TP.HCM','15 Lý Thường Kiệt, Q10, TP.HCM'];
const payments = ['cod','bank_transfer','momo'];
const statuses = ['pending','confirmed','delivering','delivered','delivered','delivered']; // delivered nhiều hơn
const events = ['page_view','product_view','add_to_cart','cart_view','filter_change','checkout_start','checkout_complete','remove_from_cart'];
const sessions = Array.from({length: 30}, (_,i) => `sess_${Date.now()-i*100000}_${Math.random().toString(36).substr(2,8)}`);

function randomDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(Math.random() * daysAgo));
  d.setHours(Math.floor(Math.random()*14)+8);
  d.setMinutes(Math.floor(Math.random()*60));
  return d.toISOString();
}

function rand(arr) { return arr[Math.floor(Math.random()*arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random()*(max-min+1))+min; }

async function seed() {
  const client = await pool.connect();
  try {
    // Lấy danh sách products
    const { rows: products } = await client.query('SELECT id, name, price FROM products');
    if (!products.length) { console.log('Không có sản phẩm. Chạy schema.sql trước.'); return; }

    console.log('🌱 Đang tạo dữ liệu...');

    // ── 1. Tạo orders (200 đơn, trải dài 90 ngày) ──
    for (let i = 0; i < 200; i++) {
      await client.query('BEGIN');
      const name    = rand(names);
      const status  = rand(statuses);
      const created = randomDate(90);
      const items   = Array.from({length: randInt(1,4)}, () => ({
        product: rand(products),
        qty: randInt(1,3)
      }));
      const total = items.reduce((s,i) => s + parseFloat(i.product.price)*i.qty, 0);

      const { rows: [order] } = await client.query(
        `INSERT INTO orders (session_id, customer_name, customer_email, customer_phone,
          shipping_address, payment_method, status, total_amount, notes, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING id`,
        [rand(sessions), name, emails(name), phones(), rand(addresses),
         rand(payments), status, total, '', created]
      );

      for (const item of items) {
        await client.query(
          `INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity, subtotal)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [order.id, item.product.id, item.product.name, item.product.price, item.qty, parseFloat(item.product.price)*item.qty]
        );
      }

      // Status history
      const flow = ['pending'];
      if (['confirmed','delivering','delivered'].includes(status)) flow.push('confirmed');
      if (['delivering','delivered'].includes(status)) flow.push('delivering');
      if (status === 'delivered') flow.push('delivered');

      let t = new Date(created);
      for (const s of flow) {
        t = new Date(t.getTime() + randInt(30,180)*60000);
        await client.query(
          `INSERT INTO order_status_history (order_id, status, changed_at) VALUES ($1,$2,$3)`,
          [order.id, s, t.toISOString()]
        );
      }

      await client.query('COMMIT');
      if ((i+1) % 20 === 0) console.log(`  ✅ ${i+1} orders`);
    }

    // ── 2. Tạo behavior_logs (1000 events) ──
    const { rows: prods } = await client.query('SELECT id, name FROM products');
    for (let i = 0; i < 1000; i++) {
      const event = rand(events);
      const prod  = ['product_view','add_to_cart','remove_from_cart'].includes(event) ? rand(prods) : null;
      await client.query(
        `INSERT INTO behavior_logs (session_id, event_type, product_id, product_name, data, page_url, user_agent, ip_address, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          rand(sessions), event,
          prod?.id || null, prod?.name || null,
          JSON.stringify({ deviceType: rand(['desktop','mobile']), category: rand(['Cà phê','Trà','Phụ kiện','all']) }),
          'http://18.139.46.45:3001',
          rand(['Mozilla/5.0 (Windows NT 10.0)','Mozilla/5.0 (iPhone; CPU iPhone OS 16)']),
          `::ffff:${randInt(1,254)}.${randInt(1,254)}.${randInt(1,254)}.${randInt(1,254)}`,
          randomDate(90)
        ]
      );
    }
    console.log('  ✅ 1000 behavior logs');

    // ── 3. Tạo sessions ──
    for (const sid of sessions) {
      await client.query(
        `INSERT INTO sessions (id, device_type, referrer, first_seen, last_seen, page_views)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO NOTHING`,
        [sid, rand(['desktop','mobile']), rand(['google.com','facebook.com','direct','']),
         randomDate(90), randomDate(30), randInt(1,20)]
      );
    }
    console.log('  ✅ 30 sessions');

    console.log('\n🎉 Xong! Tổng kết:');
    const [o,b,s] = await Promise.all([
      client.query('SELECT COUNT(*) FROM orders'),
      client.query('SELECT COUNT(*) FROM behavior_logs'),
      client.query('SELECT COUNT(*) FROM sessions'),
    ]);
    console.log(`  📦 Orders:         ${o.rows[0].count}`);
    console.log(`  📋 Behavior logs:  ${b.rows[0].count}`);
    console.log(`  👤 Sessions:       ${s.rows[0].count}`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Lỗi:', err.message);
  } finally {
    client.release();
    pool.end();
  }
}

seed();
