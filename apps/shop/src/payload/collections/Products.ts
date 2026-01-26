import type { CollectionConfig } from 'payload'

export const Products: CollectionConfig = {
  slug: 'products',
  admin: {
    useAsTitle: 'title',
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
    },
    {
      name: 'description',
      type: 'richText',
    },
    {
      name: 'price',
      type: 'number',
      required: true,
      min: 0,
    },
    {
      name: 'compareAtPrice',
      type: 'number',
      min: 0,
    },
    {
      name: 'sku',
      type: 'text',
      unique: true,
    },
    {
      name: 'images',
      type: 'array',
      fields: [
        {
          name: 'image',
          type: 'upload',
          relationTo: 'media',
          required: true,
        },
      ],
    },
    {
      name: 'category',
      type: 'relationship',
      relationTo: 'categories',
      hasMany: true,
    },
    {
      name: 'brand',
      type: 'relationship',
      relationTo: 'brands',
    },
    {
      name: 'seller',
      type: 'relationship',
      relationTo: 'sellers',
      required: true,
    },
    {
      name: 'inventory',
      type: 'number',
      required: true,
      defaultValue: 0,
      min: 0,
    },
    {
      name: 'variants',
      type: 'array',
      label: 'Product Variants',
      admin: {
        description: 'Add product variants like color, size, material, etc.',
      },
      fields: [
        {
          name: 'name',
          type: 'text',
          required: true,
          admin: {
            description: 'Variant name (e.g., Color, Size, Material)',
          },
        },
        {
          name: 'options',
          type: 'array',
          required: true,
          fields: [
            {
              name: 'value',
              type: 'text',
              required: true,
            },
            {
              name: 'sku',
              type: 'text',
              admin: {
                description: 'Optional SKU for this variant option',
              },
            },
            {
              name: 'price',
              type: 'number',
              admin: {
                description: 'Optional price override for this variant option',
              },
            },
            {
              name: 'inventory',
              type: 'number',
              defaultValue: 0,
              admin: {
                description: 'Inventory for this specific variant option',
              },
            },
            {
              name: 'image',
              type: 'upload',
              relationTo: 'media',
              admin: {
                description: 'Optional image for this variant option (e.g., color swatch)',
              },
            },
          ],
        },
      ],
    },
    {
      name: 'weight',
      type: 'number',
      admin: {
        description: 'Product weight in kg',
      },
    },
    {
      name: 'dimensions',
      type: 'group',
      fields: [
        {
          name: 'length',
          type: 'number',
          admin: {
            description: 'Length in cm',
          },
        },
        {
          name: 'width',
          type: 'number',
          admin: {
            description: 'Width in cm',
          },
        },
        {
          name: 'height',
          type: 'number',
          admin: {
            description: 'Height in cm',
          },
        },
      ],
    },
    {
      name: 'status',
      type: 'select',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
        { label: 'Archived', value: 'archived' },
      ],
      defaultValue: 'draft',
    },
    {
      name: 'featured',
      type: 'checkbox',
      defaultValue: false,
    },
    {
      name: 'bestseller',
      type: 'checkbox',
      defaultValue: false,
    },
  ],
}
