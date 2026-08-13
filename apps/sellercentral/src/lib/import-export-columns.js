const LANGS = ["de", "en", "tr", "fr", "it", "es"];
const METAFIELD_PAIRS = 15;

function col(key, label) {
  return { key, label };
}

function buildProductColumns() {
  const groups = [];

  groups.push({
    id: "core",
    label: "Core",
    columns: [
      col("product_type", "product_type"),
      col("sku", "sku"),
      col("parent_sku", "parent_sku"),
      col("status", "status"),
      col("ean", "ean"),
      col("inventory", "inventory"),
      col("brand", "brand"),
      col("type", "type"),
      col("category_slug", "category_slug"),
      col("shipping_group", "shipping_group"),
    ],
  });

  groups.push({
    id: "legal",
    label: "Manufacturer / GPSR",
    columns: [
      col("manufacturer", "manufacturer"),
      col("manufacturer_information", "manufacturer_information"),
      col("responsible_person_information", "responsible_person_information"),
      col("weee_number", "weee_number"),
      col("eprel_number", "eprel_number"),
    ],
  });

  groups.push({
    id: "dims",
    label: "Dimensions",
    columns: [
      col("weight_grams", "weight_grams"),
      col("dim_length_cm", "dim_length_cm"),
      col("dim_width_cm", "dim_width_cm"),
      col("dim_height_cm", "dim_height_cm"),
      col("unit_type", "unit_type"),
      col("unit_value", "unit_value"),
      col("per_unit", "per_unit"),
    ],
  });

  groups.push({
    id: "prices",
    label: "Prices",
    columns: [
      col("price", "price"),
      col("price_uvp", "price_uvp"),
      col("price_sale", "price_sale"),
    ],
  });

  groups.push({
    id: "images",
    label: "Images",
    columns: [
      col("image_url_1", "image_url_1"),
      col("image_url_2", "image_url_2"),
      col("image_url_3", "image_url_3"),
      col("image_url_4", "image_url_4"),
      col("image_url_5", "image_url_5"),
      col("swatch_image_url", "swatch_image_url"),
    ],
  });

  const optionCols = [];
  for (let i = 1; i <= 6; i++) {
    optionCols.push(col(`option${i}_name`, `option${i}_name`));
    optionCols.push(col(`option${i}_value`, `option${i}_value`));
  }
  groups.push({ id: "options", label: "Variants", columns: optionCols });

  const fileCols = [];
  for (let i = 1; i <= 5; i++) {
    fileCols.push(col(`file_${i}_url`, `file_${i}_url`));
    fileCols.push(col(`file_${i}_name`, `file_${i}_name`));
  }
  groups.push({ id: "files", label: "Files", columns: fileCols });

  const mfCols = [];
  for (let i = 1; i <= METAFIELD_PAIRS; i++) {
    mfCols.push(col(`metafield_${i}_key`, `metafield_${i}_key`));
    mfCols.push(col(`metafield_${i}_value`, `metafield_${i}_value`));
  }
  groups.push({ id: "metafields", label: "Eigenschaften", columns: mfCols });

  for (const lang of LANGS) {
    groups.push({
      id: `lang_${lang}`,
      label: lang.toUpperCase(),
      columns: [
        col(`title_${lang}`, `title_${lang}`),
        col(`description_${lang}`, `description_${lang}`),
        col(`bullet1_${lang}`, `bullet1_${lang}`),
        col(`bullet2_${lang}`, `bullet2_${lang}`),
        col(`bullet3_${lang}`, `bullet3_${lang}`),
        col(`bullet4_${lang}`, `bullet4_${lang}`),
        col(`bullet5_${lang}`, `bullet5_${lang}`),
        col(`seo_title_${lang}`, `seo_title_${lang}`),
        col(`seo_description_${lang}`, `seo_description_${lang}`),
        col(`seo_keywords_${lang}`, `seo_keywords_${lang}`),
      ],
    });
  }

  groups.push({
    id: "seller",
    label: "Seller",
    columns: [col("Verkäufer", "Verkäufer"), col("_product_id", "_product_id")],
  });

  return groups;
}

const PRODUCT_GROUPS = buildProductColumns();

export const EXPORT_DATASETS = {
  products: {
    key: "products",
    sheetName: "Products",
    superuserOnly: false,
    groups: PRODUCT_GROUPS,
    columns: PRODUCT_GROUPS.flatMap((g) => g.columns),
    defaultKeys: [
      "product_type", "sku", "parent_sku", "status", "ean", "inventory",
      "brand", "category_slug", "title_de", "description_de",
      "price", "price_uvp", "price_sale", "image_url_1",
    ],
  },
  orders: {
    key: "orders",
    sheetName: "Orders",
    superuserOnly: false,
    groups: [{
      id: "orders",
      label: "Order",
      columns: [
        col("order_number", "Order number"),
        col("created_at", "Created at"),
        col("order_status", "Order status"),
        col("payment_status", "Payment status"),
        col("delivery_status", "Delivery status"),
        col("email", "Email"),
        col("first_name", "First name"),
        col("last_name", "Last name"),
        col("phone", "Phone"),
        col("address_line1", "Address"),
        col("address_line2", "Address 2"),
        col("city", "City"),
        col("postal_code", "Postal code"),
        col("country", "Country"),
        col("currency", "Currency"),
        col("subtotal", "Subtotal"),
        col("shipping", "Shipping"),
        col("discount", "Discount"),
        col("total", "Total"),
        col("tracking_number", "Tracking number"),
        col("carrier_name", "Carrier"),
        col("shipped_at", "Shipped at"),
        col("seller_id", "Seller"),
      ],
    }],
    columns: null,
    defaultKeys: [
      "order_number", "created_at", "order_status", "payment_status", "delivery_status",
      "email", "first_name", "last_name", "city", "country", "currency", "total",
      "tracking_number", "carrier_name",
    ],
  },
  transactions: {
    key: "transactions",
    sheetName: "Transactions",
    superuserOnly: false,
    groups: [{
      id: "tx",
      label: "Transaction",
      columns: [
        col("type", "Type"),
        col("order_number", "Order number"),
        col("created_at", "Created at"),
        col("payment_status", "Payment status"),
        col("delivery_status", "Delivery status"),
        col("currency", "Currency"),
        col("total", "Total"),
        col("commission", "Commission"),
        col("payout", "Payout"),
        col("payout_eligible", "Payout eligible"),
        col("store_name", "Store"),
        col("seller_id", "Seller"),
      ],
    }, {
      id: "accounting",
      label: "Accounting / Tax",
      columns: [
        col("order_id", "Order ID"),
        col("customer_id", "Customer ID"),
        col("destination_country", "Destination country"),
        col("vat_scheme", "VAT scheme"),
        col("goods_vat_rate_percent", "Goods VAT %"),
        col("goods_net_cents", "Goods net"),
        col("goods_vat_cents", "Goods VAT"),
        col("gross_sale_cents", "Gross sale"),
        col("commission_net_cents", "Commission (net)"),
        col("commission_vat_cents", "Commission VAT"),
        col("bonus_earned_points", "Bonus points earned"),
        col("bonus_redeemed_cents", "Bonus redeemed"),
        col("platform_bonus_funding_cents", "Platform bonus funding"),
        col("customer_paid_cents", "Customer paid"),
        col("seller_payout_cents", "Seller payout"),
        col("refund_cents", "Refund"),
        col("stripe_payment_intent_id", "Stripe payment intent ID"),
        col("stripe_transfer_or_payout_id", "Stripe transfer/payout ID"),
        col("accounting_category", "Accounting category"),
      ],
    }],
    columns: null,
    defaultKeys: [
      "type", "order_number", "created_at", "payment_status",
      "total", "commission", "payout", "payout_eligible", "currency",
    ],
  },
  customers: {
    key: "customers",
    sheetName: "Customers",
    superuserOnly: true,
    groups: [{
      id: "customers",
      label: "Customer",
      columns: [
        col("customer_number", "Customer number"),
        col("email", "Email"),
        col("first_name", "First name"),
        col("last_name", "Last name"),
        col("phone", "Phone"),
        col("country", "Country"),
        col("is_registered", "Registered"),
        col("order_count", "Orders"),
        col("total_spent", "Total spent"),
        col("created_at", "Created at"),
      ],
    }],
    columns: null,
    defaultKeys: [
      "customer_number", "email", "first_name", "last_name",
      "country", "order_count", "total_spent", "created_at",
    ],
  },
  ranking: {
    key: "ranking",
    sheetName: "Ranking",
    superuserOnly: true,
    groups: [{
      id: "ranking",
      label: "Performance",
      columns: [
        col("title", "Title"),
        col("handle", "Handle"),
        col("status", "Status"),
        col("seller_id", "Seller"),
        col("impressions_30d", "Views (30d)"),
        col("clicks_30d", "Clicks (30d)"),
        col("add_to_cart_30d", "Add to cart (30d)"),
        col("sales_7d", "Sales (7d)"),
        col("sales_30d", "Sales (30d)"),
        col("sales_90d", "Sales (90d)"),
        col("gmv_30d", "GMV (30d)"),
        col("review_avg", "Rating"),
        col("review_count", "Reviews"),
        col("inventory", "Inventory"),
        col("final_score", "Score"),
      ],
    }],
    columns: null,
    defaultKeys: [
      "title", "handle", "impressions_30d", "clicks_30d",
      "sales_30d", "gmv_30d", "inventory", "final_score",
    ],
  },
};

for (const ds of Object.values(EXPORT_DATASETS)) {
  if (!ds.columns) ds.columns = ds.groups.flatMap((g) => g.columns);
}

export const SELLER_EXPORT_KEYS = Object.values(EXPORT_DATASETS)
  .filter((d) => !d.superuserOnly)
  .map((d) => d.key);

export const ALL_EXPORT_KEYS = Object.keys(EXPORT_DATASETS);

export function getExportDataset(key) {
  return EXPORT_DATASETS[key] || null;
}

export function resolveExportColumns(datasetKey, selectedKeys) {
  const ds = getExportDataset(datasetKey);
  if (!ds) return [];
  const allowed = new Set(ds.columns.map((c) => c.key));
  const picked = Array.isArray(selectedKeys)
    ? selectedKeys.map(String).filter((k) => allowed.has(k))
    : [];
  if (picked.length) return ds.columns.filter((c) => picked.includes(c.key));
  const defaults = ds.defaultKeys.filter((k) => allowed.has(k));
  if (defaults.length) return ds.columns.filter((c) => defaults.includes(c.key));
  return ds.columns;
}
