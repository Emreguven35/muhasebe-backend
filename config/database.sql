-- Users tablosu
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Receipts tablosu
CREATE TABLE receipts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  firma_unvani TEXT,
  tarih VARCHAR(50),
  fis_no VARCHAR(50),
  gider_cinsi VARCHAR(100),
  toplam_tutar DECIMAL(10, 2),
  kdv1 DECIMAL(10, 2) DEFAULT 0,
  kdv10 DECIMAL(10, 2) DEFAULT 0,
  kdv20 DECIMAL(10, 2) DEFAULT 0,
  image_path TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index'ler
CREATE INDEX idx_receipts_user_id ON receipts(user_id);
CREATE INDEX idx_receipts_tarih ON receipts(tarih);