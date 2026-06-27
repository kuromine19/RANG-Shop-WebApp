-- ============================================================
-- SHOP DATABASE SCHEMA
-- ============================================================

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  image_url TEXT,
  category VARCHAR(100),
  stock INT DEFAULT 100,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255),
  customer_name VARCHAR(255),
  customer_email VARCHAR(255),
  customer_phone VARCHAR(50),
  total_amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  payment_method VARCHAR(50) DEFAULT 'cod',
  shipping_address TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Order items table
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INT REFERENCES orders(id) ON DELETE CASCADE,
  product_id INT REFERENCES products(id),
  product_name VARCHAR(255),
  product_price DECIMAL(10,2),
  quantity INT NOT NULL,
  subtotal DECIMAL(10,2)
);

-- Behavior logs table
CREATE TABLE IF NOT EXISTS behavior_logs (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255),
  event_type VARCHAR(100) NOT NULL,
  -- event types: page_view, product_view, add_to_cart, remove_from_cart,
  --              checkout_start, checkout_complete, search, filter_change
  product_id INT REFERENCES products(id) ON DELETE SET NULL,
  product_name VARCHAR(255),
  data JSONB,           -- flexible extra data (search query, quantity, etc.)
  page_url TEXT,
  user_agent TEXT,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Sessions table (optional session tracking)
CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(255) PRIMARY KEY,
  device_type VARCHAR(50),
  referrer TEXT,
  first_seen TIMESTAMP DEFAULT NOW(),
  last_seen TIMESTAMP DEFAULT NOW(),
  page_views INT DEFAULT 0
);

-- Seed sample products
INSERT INTO products (name, description, price, image_url, category, stock) VALUES
('Cà phê Arabica Đà Lạt', 'Hạt cà phê Arabica thượng hạng từ vùng cao Đà Lạt, rang mộc nguyên chất. Hương thơm thanh tao, vị chua nhẹ, hậu vị ngọt.', 189000, 'https://images.unsplash.com/photo-1611854779393-1b2da9d400fe?w=400', 'Cà phê', 50),
('Cà phê Robusta Buôn Ma Thuột', 'Robusta đặc sản Buôn Ma Thuột - vị đậm đà, đắng nhẹ, thơm nồng. Phù hợp pha phin truyền thống.', 149000, 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400', 'Cà phê', 80),
('Bộ Cà phê Blend Signature', 'Hỗn hợp độc quyền 70% Arabica + 30% Robusta. Cân bằng hoàn hảo giữa vị chua thanh và đắng đậm đà.', 229000, 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=400', 'Cà phê', 40),
('Trà Oolong Shan Tuyết', 'Trà Oolong từ cây chè cổ thụ trên núi cao 1500m. Lên men bán phần, hương hoa tự nhiên, vị ngọt hậu.', 279000, 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400', 'Trà', 35),
('Trà Matcha Nhật Bản', 'Matcha hảo hạng nhập khẩu từ Uji, Nhật Bản. Màu xanh tươi đặc trưng, vị umami tinh tế, phù hợp pha latte.', 399000, 'https://images.unsplash.com/photo-1515823662972-da6a2e4d3002?w=400', 'Trà', 25),
('Máy pha cà phê Mini', 'Máy pha cà phê espresso compact, áp suất 15 bar, phù hợp dùng tại nhà. Kèm bình đánh sữa.', 1890000, 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400', 'Phụ kiện', 15),
('Bình giữ nhiệt Titan 500ml', 'Bình giữ nhiệt cao cấp, inox 304, giữ nóng 12h / lạnh 24h. Khắc logo theo yêu cầu.', 359000, 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=400', 'Phụ kiện', 60),
('Phin cà phê inox', 'Phin pha cà phê truyền thống bằng inox 304, không gỉ. Size 6 - phù hợp 1-2 người dùng.', 89000, 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400', 'Phụ kiện', 100)
ON CONFLICT DO NOTHING;
