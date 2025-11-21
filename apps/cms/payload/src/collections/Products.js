module.exports = {
  Products: {
    slug: "products",
    admin: {
      useAsTitle: "title",
    },
    access: {
      read: () => true,
      create: () => true,
      update: () => true,
      delete: () => true,
    },
    fields: [
      {
        name: "title",
        type: "text",
        required: true,
      },
      {
        name: "slug",
        type: "text",
        required: true,
        unique: true,
      },
      {
        name: "description",
        type: "richText",
      },
      {
        name: "price",
        type: "number",
        required: true,
        min: 0,
      },
      {
        name: "compareAtPrice",
        type: "number",
        min: 0,
      },
      {
        name: "sku",
        type: "text",
        unique: true,
      },
      {
        name: "images",
        type: "array",
        fields: [
          {
            name: "image",
            type: "upload",
            relationTo: "media",
            required: true,
          },
        ],
      },
      {
        name: "category",
        type: "relationship",
        relationTo: "categories",
        hasMany: true,
      },
      {
        name: "brand",
        type: "relationship",
        relationTo: "brands",
      },
      {
        name: "seller",
        type: "relationship",
        relationTo: "sellers",
        required: true,
      },
      {
        name: "inventory",
        type: "number",
        required: true,
        defaultValue: 0,
        min: 0,
      },
      {
        name: "status",
        type: "select",
        options: [
          { label: "Draft", value: "draft" },
          { label: "Published", value: "published" },
          { label: "Archived", value: "archived" },
        ],
        defaultValue: "draft",
      },
      {
        name: "featured",
        type: "checkbox",
        defaultValue: false,
      },
      {
        name: "bestseller",
        type: "checkbox",
        defaultValue: false,
      },
    ],
  },
};

