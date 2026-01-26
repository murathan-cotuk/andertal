import type { CollectionConfig } from 'payload'

export const Customers: CollectionConfig = {
  slug: 'customers',
  admin: {
    useAsTitle: 'email',
  },
  auth: true,
  access: {
    read: () => true,
    create: () => true,
    update: ({ req: { user } }) => {
      if (user) {
        return {
          id: {
            equals: user.id,
          },
        }
      }
      return false
    },
    delete: () => false,
  },
  fields: [
    {
      name: 'email',
      type: 'email',
      required: true,
      unique: true,
    },
    {
      name: 'googleId',
      type: 'text',
      admin: {
        description: 'Google OAuth ID',
      },
    },
    {
      name: 'firstName',
      type: 'text',
      required: true,
    },
    {
      name: 'lastName',
      type: 'text',
      required: true,
    },
    {
      name: 'gender',
      type: 'select',
      options: [
        { label: 'Male', value: 'male' },
        { label: 'Female', value: 'female' },
        { label: 'Other', value: 'other' },
      ],
    },
    {
      name: 'birthDate',
      type: 'date',
    },
    {
      name: 'phone',
      type: 'text',
      required: true,
    },
    {
      name: 'address',
      type: 'text',
      required: true,
      admin: {
        description: 'Street address',
      },
    },
    {
      name: 'addressLine2',
      type: 'text',
      admin: {
        description: 'Address additional info (Adresszusatz)',
      },
    },
    {
      name: 'zipCode',
      type: 'text',
      required: true,
      admin: {
        description: 'PLZ (Postal code)',
      },
    },
    {
      name: 'city',
      type: 'text',
      required: true,
      admin: {
        description: 'Ort (City)',
      },
    },
    {
      name: 'country',
      type: 'text',
      required: true,
      admin: {
        description: 'Land (Country)',
      },
    },
    {
      name: 'userId',
      type: 'text',
      admin: {
        description: 'User ID for authentication',
      },
    },
  ],
}
