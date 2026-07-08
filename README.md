# RANG Shop WebApp

A mock Vietnamese coffee & tea e-commerce web application built to simulate real-world customer behavior and order data for a data engineering pipeline.

## Demo

[![RANG Shop Demo](https://youtu.be/TYrmBoEgd6I)](https://youtu.be/TYrmBoEgd6I)

> Demo video showcasing the customer-facing shop and admin dashboard.

## Purpose

This app serves as the **data source** for the [RANG Shop Data Pipeline](https://github.com/kuromine19/RANG-shop-data). It generates:
- Transactional data (orders, order items, products)
- Behavioral data (page views, add to cart, checkout events)

## Stack

- **Backend** — Node.js + Express
- **Frontend** — HTML, CSS, Vanilla JS
- **Database** — PostgreSQL

## Features

### Customer-facing
- Product catalog with category filtering
- Shopping cart
- Checkout with customer information form
- Order confirmation

### Admin dashboard (`/admin.html`)
- Revenue overview (delivered orders only)
- Order management with status tracking
- Order status history timeline
- Behavior logs with event breakdown

## Data Schema

**PostgreSQL — database: `shopdb`**

| Schema | Tables |
|--------|--------|
| `app` | `orders`, `order_items`, `products`, `order_status_history` |
| `app_events` | `behavior_logs`, `sessions` |

## Behavior Tracking

Every customer interaction is logged to `app_events.behavior_logs`:

| Event | Trigger |
|-------|---------|
| `page_view` | Page load |
| `product_view` | Click on product |
| `add_to_cart` | Add to cart button |
| `remove_from_cart` | Remove from cart |
| `cart_view` | Open cart drawer |
| `filter_change` | Change category filter |
| `checkout_start` | Open checkout modal |
| `checkout_complete` | Place order successfully |

## Quick Start

### 1. Clone repo
```bash
git clone https://github.com/kuromine19/RANG-Shop-WebApp.git
cd RANG-Shop-WebApp
```

### 2. Setup database
```bash
psql -U postgres -c "CREATE DATABASE shopdb;"
psql -U postgres -d shopdb -f backend/schema.sql
```

### 3. Configure environment
```bash
cd backend
cp .env.example .env
nano .env  # fill in DB credentials
```

### 4. Install and run
```bash
npm install
npm start
```

### 5. Access
- Shop: `http://localhost:3001`
- Admin: `http://localhost:3001/admin.html`

