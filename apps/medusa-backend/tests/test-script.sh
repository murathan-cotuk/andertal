#!/bin/bash

# Region + Product Entegrasyon Test Script
# Medusa backend'in çalıştığından emin ol: medusa develop

BASE_URL="http://localhost:9000"

echo "🧪 Region + Product Entegrasyon Testi Başlıyor..."
echo ""

# 1. Region Oluştur
echo "1️⃣  Region oluşturuluyor (DE)..."
REGION_RESPONSE=$(curl -s -X POST "$BASE_URL/admin/regions" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Germany",
    "code": "DE",
    "currency_code": "EUR"
  }')

REGION_ID=$(echo $REGION_RESPONSE | jq -r '.region.id')
REGION_CODE=$(echo $REGION_RESPONSE | jq -r '.region.code')

if [ "$REGION_ID" != "null" ] && [ -n "$REGION_ID" ]; then
  echo "✅ Region oluşturuldu: $REGION_ID ($REGION_CODE)"
else
  echo "❌ Region oluşturulamadı"
  echo "Response: $REGION_RESPONSE"
  exit 1
fi

echo ""

# 2. Region Listele
echo "2️⃣  Region'lar listeleniyor..."
REGIONS_LIST=$(curl -s "$BASE_URL/admin/regions")
REGIONS_COUNT=$(echo $REGIONS_LIST | jq -r '.count')

if [ "$REGIONS_COUNT" -gt 0 ]; then
  echo "✅ $REGIONS_COUNT region bulundu"
else
  echo "❌ Region bulunamadı"
  exit 1
fi

echo ""

# 3. Product Oluştur (Medusa Core)
echo "3️⃣  Product oluşturuluyor (Medusa core)..."
PRODUCT_RESPONSE=$(curl -s -X POST "$BASE_URL/admin/products" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Product",
    "description": "Test product for region integration",
    "handle": "test-product-'$(date +%s)'",
    "is_giftcard": false,
    "status": "published",
    "images": [],
    "options": [],
    "variants": [
      {
        "title": "Default Variant",
        "sku": "TEST-SKU-'$(date +%s)'",
        "prices": [
          {
            "amount": 1000,
            "currency_code": "EUR"
          }
        ],
        "inventory_quantity": 10
      }
    ]
  }')

PRODUCT_ID=$(echo $PRODUCT_RESPONSE | jq -r '.product.id')

if [ "$PRODUCT_ID" != "null" ] && [ -n "$PRODUCT_ID" ]; then
  echo "✅ Product oluşturuldu: $PRODUCT_ID"
else
  echo "❌ Product oluşturulamadı"
  echo "Response: $PRODUCT_RESPONSE"
  exit 1
fi

echo ""

# 4. Product'ı Region'a Bağla
echo "4️⃣  Product region'a bağlanıyor..."
ATTACH_RESPONSE=$(curl -s -X POST "$BASE_URL/admin/regions/$REGION_ID/products" \
  -H "Content-Type: application/json" \
  -d "{
    \"product_id\": \"$PRODUCT_ID\"
  }")

RELATION_ID=$(echo $ATTACH_RESPONSE | jq -r '.relation.id')

if [ "$RELATION_ID" != "null" ] && [ -n "$RELATION_ID" ]; then
  echo "✅ Product region'a bağlandı: $RELATION_ID"
else
  echo "❌ Product region'a bağlanamadı"
  echo "Response: $ATTACH_RESPONSE"
  exit 1
fi

echo ""

# 5. Store Products (Region Filtreleme)
echo "5️⃣  Store products (region=DE) test ediliyor..."
STORE_RESPONSE=$(curl -s "$BASE_URL/store/products?region=DE")
STORE_COUNT=$(echo $STORE_RESPONSE | jq -r '.count')
STORE_REGION=$(echo $STORE_RESPONSE | jq -r '.region')

if [ "$STORE_COUNT" -gt 0 ] && [ "$STORE_REGION" == "DE" ]; then
  echo "✅ $STORE_COUNT product bulundu (region: $STORE_REGION)"
  echo "   Product ID: $(echo $STORE_RESPONSE | jq -r '.products[0].id')"
else
  echo "❌ Store products test başarısız"
  echo "Response: $STORE_RESPONSE"
  exit 1
fi

echo ""

# 6. Store Products (Region Olmadan)
echo "6️⃣  Store products (tüm ürünler) test ediliyor..."
ALL_PRODUCTS=$(curl -s "$BASE_URL/store/products")
ALL_COUNT=$(echo $ALL_PRODUCTS | jq -r '.count')

if [ "$ALL_COUNT" -gt 0 ]; then
  echo "✅ $ALL_COUNT product bulundu (region filtresi yok)"
else
  echo "⚠️  Product bulunamadı (normal olabilir)"
fi

echo ""

echo "🎉 Tüm testler başarılı!"
echo ""
echo "📋 Özet:"
echo "   - Region ID: $REGION_ID"
echo "   - Product ID: $PRODUCT_ID"
echo "   - Region'a bağlı product sayısı: $STORE_COUNT"
echo ""
echo "✅ Sellercentral → Medusa → PostgreSQL → Shop App veri akışı çalışıyor!"
