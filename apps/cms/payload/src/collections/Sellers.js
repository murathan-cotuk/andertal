module.exports = {
  Sellers: {
    slug: "sellers",
    admin: {
      useAsTitle: "storeName",
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
          };
        }
        return false;
      },
      delete: () => false,
    },
    fields: [
      {
        name: "storeName",
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
        type: "textarea",
      },
      {
        name: "logo",
        type: "upload",
        relationTo: "media",
      },
      {
        name: "banner",
        type: "upload",
        relationTo: "media",
      },
      {
        name: "stripeAccountId",
        type: "text",
        admin: {
          description: "Stripe Connect account ID for payouts",
        },
      },
      {
        name: "commissionRate",
        type: "number",
        defaultValue: 10,
        admin: {
          description: "Commission rate percentage (default 10%)",
        },
      },
      {
        name: "status",
        type: "select",
        options: [
          { label: "Pending", value: "pending" },
          { label: "Active", value: "active" },
          { label: "Suspended", value: "suspended" },
        ],
        defaultValue: "pending",
      },
    ],
  },
};

