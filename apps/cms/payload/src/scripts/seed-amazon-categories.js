/**
 * Seed script to create Amazon categories
 * Run this script to populate the database with Amazon's category structure
 * 
 * Usage: node apps/cms/payload/src/scripts/seed-amazon-categories.js
 */

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load .env.local file BEFORE importing config
const envPath = path.resolve(__dirname, '../.env.local')
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
  console.log('✅ Loaded .env.local from:', envPath)
} else {
  // Try root .env.local
  const rootEnvPath = path.resolve(__dirname, '../../../.env.local')
  if (fs.existsSync(rootEnvPath)) {
    dotenv.config({ path: rootEnvPath })
    console.log('✅ Loaded .env.local from root:', rootEnvPath)
  } else {
    console.log('⚠️  .env.local not found, using environment variables')
  }
}

// Now import config and payload after env vars are loaded
import { getPayload } from 'payload'
import config from '../payload.config.js'

const amazonCategories = [
  // 1. Electronics
  { name: 'Electronics', slug: 'electronics', parent: null },
  { name: 'Computers & Accessories', slug: 'computers-accessories', parent: 'electronics' },
  { name: 'Laptops', slug: 'laptops', parent: 'computers-accessories' },
  { name: 'Desktops', slug: 'desktops', parent: 'computers-accessories' },
  { name: 'Monitors', slug: 'monitors', parent: 'computers-accessories' },
  { name: 'Keyboards & Mice', slug: 'keyboards-mice', parent: 'computers-accessories' },
  { name: 'Mobile Phones & Accessories', slug: 'mobile-phones-accessories', parent: 'electronics' },
  { name: 'Smartphones', slug: 'smartphones', parent: 'mobile-phones-accessories' },
  { name: 'Phone Cases', slug: 'phone-cases', parent: 'mobile-phones-accessories' },
  { name: 'Chargers & Cables', slug: 'chargers-cables', parent: 'mobile-phones-accessories' },
  { name: 'Audio & Video', slug: 'audio-video', parent: 'electronics' },
  { name: 'Headphones', slug: 'headphones', parent: 'audio-video' },
  { name: 'Speakers', slug: 'speakers', parent: 'audio-video' },
  { name: 'TVs', slug: 'tvs', parent: 'audio-video' },
  { name: 'Cameras & Photography', slug: 'cameras-photography', parent: 'electronics' },
  { name: 'Digital Cameras', slug: 'digital-cameras', parent: 'cameras-photography' },
  { name: 'Action Cameras', slug: 'action-cameras', parent: 'cameras-photography' },
  { name: 'Wearable Technology', slug: 'wearable-technology', parent: 'electronics' },
  { name: 'Smartwatches', slug: 'smartwatches', parent: 'wearable-technology' },
  { name: 'Fitness Trackers', slug: 'fitness-trackers', parent: 'wearable-technology' },

  // 2. Computers
  { name: 'Computers', slug: 'computers', parent: null },
  { name: 'Desktop PCs', slug: 'desktop-pcs', parent: 'computers' },
  { name: 'Computer Components', slug: 'computer-components', parent: 'computers' },
  { name: 'CPUs', slug: 'cpus', parent: 'computer-components' },
  { name: 'GPUs', slug: 'gpus', parent: 'computer-components' },
  { name: 'Motherboards', slug: 'motherboards', parent: 'computer-components' },
  { name: 'RAM', slug: 'ram', parent: 'computer-components' },
  { name: 'Storage', slug: 'storage', parent: 'computer-components' },
  { name: 'SSDs', slug: 'ssds', parent: 'storage' },
  { name: 'HDDs', slug: 'hdds', parent: 'storage' },
  { name: 'Networking', slug: 'networking', parent: 'computers' },
  { name: 'Routers', slug: 'routers', parent: 'networking' },
  { name: 'Modems', slug: 'modems', parent: 'networking' },

  // 3. Home & Kitchen
  { name: 'Home & Kitchen', slug: 'home-kitchen', parent: null },
  { name: 'Kitchen & Dining', slug: 'kitchen-dining', parent: 'home-kitchen' },
  { name: 'Cookware', slug: 'cookware', parent: 'kitchen-dining' },
  { name: 'Kitchen Appliances', slug: 'kitchen-appliances', parent: 'kitchen-dining' },
  { name: 'Home Decor', slug: 'home-decor', parent: 'home-kitchen' },
  { name: 'Wall Art', slug: 'wall-art', parent: 'home-decor' },
  { name: 'Rugs', slug: 'rugs', parent: 'home-decor' },
  { name: 'Furniture', slug: 'furniture', parent: 'home-kitchen' },
  { name: 'Living Room Furniture', slug: 'living-room-furniture', parent: 'furniture' },
  { name: 'Bedroom Furniture', slug: 'bedroom-furniture', parent: 'furniture' },
  { name: 'Storage & Organization', slug: 'storage-organization', parent: 'home-kitchen' },
  { name: 'Lighting', slug: 'lighting', parent: 'home-kitchen' },

  // 4. Clothing, Shoes & Jewelry
  { name: 'Clothing, Shoes & Jewelry', slug: 'clothing-shoes-jewelry', parent: null },
  { name: 'Men', slug: 'men', parent: 'clothing-shoes-jewelry' },
  { name: "Men's Clothing", slug: 'mens-clothing', parent: 'men' },
  { name: "Men's Shoes", slug: 'mens-shoes', parent: 'men' },
  { name: "Men's Watches", slug: 'mens-watches', parent: 'men' },
  { name: 'Women', slug: 'women', parent: 'clothing-shoes-jewelry' },
  { name: "Women's Clothing", slug: 'womens-clothing', parent: 'women' },
  { name: "Women's Shoes", slug: 'womens-shoes', parent: 'women' },
  { name: "Women's Jewelry", slug: 'womens-jewelry', parent: 'women' },
  { name: 'Kids & Baby', slug: 'kids-baby', parent: 'clothing-shoes-jewelry' },
  { name: 'Accessories', slug: 'accessories', parent: 'clothing-shoes-jewelry' },
  { name: 'Bags', slug: 'bags', parent: 'accessories' },
  { name: 'Belts', slug: 'belts', parent: 'accessories' },
  { name: 'Sunglasses', slug: 'sunglasses', parent: 'accessories' },

  // 5. Beauty & Personal Care
  { name: 'Beauty & Personal Care', slug: 'beauty-personal-care', parent: null },
  { name: 'Makeup', slug: 'makeup', parent: 'beauty-personal-care' },
  { name: 'Skin Care', slug: 'skin-care', parent: 'beauty-personal-care' },
  { name: 'Hair Care', slug: 'hair-care', parent: 'beauty-personal-care' },
  { name: 'Fragrances', slug: 'fragrances', parent: 'beauty-personal-care' },
  { name: 'Personal Care Appliances', slug: 'personal-care-appliances', parent: 'beauty-personal-care' },
  { name: 'Hair Dryers', slug: 'hair-dryers', parent: 'personal-care-appliances' },
  { name: 'Trimmers', slug: 'trimmers', parent: 'personal-care-appliances' },

  // 6. Health & Household
  { name: 'Health & Household', slug: 'health-household', parent: null },
  { name: 'Health Care', slug: 'health-care', parent: 'health-household' },
  { name: 'Vitamins & Supplements', slug: 'vitamins-supplements', parent: 'health-care' },
  { name: 'Medical Supplies', slug: 'medical-supplies', parent: 'health-care' },
  { name: 'Household Supplies', slug: 'household-supplies', parent: 'health-household' },
  { name: 'Cleaning Products', slug: 'cleaning-products', parent: 'household-supplies' },
  { name: 'Paper Products', slug: 'paper-products', parent: 'household-supplies' },
  { name: 'Baby Care', slug: 'baby-care', parent: 'health-household' },
  { name: 'Sexual Wellness', slug: 'sexual-wellness', parent: 'health-household' },

  // 7. Sports & Outdoors
  { name: 'Sports & Outdoors', slug: 'sports-outdoors', parent: null },
  { name: 'Exercise & Fitness', slug: 'exercise-fitness', parent: 'sports-outdoors' },
  { name: 'Yoga', slug: 'yoga', parent: 'exercise-fitness' },
  { name: 'Strength Training', slug: 'strength-training', parent: 'exercise-fitness' },
  { name: 'Outdoor Recreation', slug: 'outdoor-recreation', parent: 'sports-outdoors' },
  { name: 'Camping & Hiking', slug: 'camping-hiking', parent: 'outdoor-recreation' },
  { name: 'Cycling', slug: 'cycling', parent: 'outdoor-recreation' },
  { name: 'Team Sports', slug: 'team-sports', parent: 'sports-outdoors' },
  { name: 'Fan Shop', slug: 'fan-shop', parent: 'sports-outdoors' },

  // 8. Toys & Games
  { name: 'Toys & Games', slug: 'toys-games', parent: null },
  { name: 'Action Figures', slug: 'action-figures', parent: 'toys-games' },
  { name: 'Dolls & Accessories', slug: 'dolls-accessories', parent: 'toys-games' },
  { name: 'Learning & Education', slug: 'learning-education', parent: 'toys-games' },
  { name: 'Puzzles & Board Games', slug: 'puzzles-board-games', parent: 'toys-games' },
  { name: 'Outdoor Play', slug: 'outdoor-play', parent: 'toys-games' },

  // 9. Automotive
  { name: 'Automotive', slug: 'automotive', parent: null },
  { name: 'Car Electronics', slug: 'car-electronics', parent: 'automotive' },
  { name: 'Exterior Accessories', slug: 'exterior-accessories', parent: 'automotive' },
  { name: 'Interior Accessories', slug: 'interior-accessories', parent: 'automotive' },
  { name: 'Tools & Equipment', slug: 'tools-equipment', parent: 'automotive' },
  { name: 'Motorcycle & Powersports', slug: 'motorcycle-powersports', parent: 'automotive' },

  // 10. Tools & Home Improvement
  { name: 'Tools & Home Improvement', slug: 'tools-home-improvement', parent: null },
  { name: 'Power Tools', slug: 'power-tools', parent: 'tools-home-improvement' },
  { name: 'Hand Tools', slug: 'hand-tools', parent: 'tools-home-improvement' },
  { name: 'Electrical', slug: 'electrical', parent: 'tools-home-improvement' },
  { name: 'Plumbing', slug: 'plumbing', parent: 'tools-home-improvement' },
  { name: 'Building Supplies', slug: 'building-supplies', parent: 'tools-home-improvement' },

  // 11. Office Products
  { name: 'Office Products', slug: 'office-products', parent: null },
  { name: 'Office Supplies', slug: 'office-supplies', parent: 'office-products' },
  { name: 'Office Electronics', slug: 'office-electronics', parent: 'office-products' },
  { name: 'Office Furniture', slug: 'office-furniture', parent: 'office-products' },
  { name: 'School Supplies', slug: 'school-supplies', parent: 'office-products' },

  // 12. Books
  { name: 'Books', slug: 'books', parent: null },
  { name: 'Literature & Fiction', slug: 'literature-fiction', parent: 'books' },
  { name: 'Business & Economics', slug: 'business-economics', parent: 'books' },
  { name: 'Science & Technology', slug: 'science-technology', parent: 'books' },
  { name: "Children's Books", slug: 'childrens-books', parent: 'books' },
  { name: 'Textbooks', slug: 'textbooks', parent: 'books' },

  // 13. Pet Supplies
  { name: 'Pet Supplies', slug: 'pet-supplies', parent: null },
  { name: 'Dog Supplies', slug: 'dog-supplies', parent: 'pet-supplies' },
  { name: 'Cat Supplies', slug: 'cat-supplies', parent: 'pet-supplies' },
  { name: 'Fish & Aquatic Pets', slug: 'fish-aquatic-pets', parent: 'pet-supplies' },
  { name: 'Bird Supplies', slug: 'bird-supplies', parent: 'pet-supplies' },

  // 14. Grocery & Gourmet Food
  { name: 'Grocery & Gourmet Food', slug: 'grocery-gourmet-food', parent: null },
  { name: 'Beverages', slug: 'beverages', parent: 'grocery-gourmet-food' },
  { name: 'Snacks', slug: 'snacks', parent: 'grocery-gourmet-food' },
  { name: 'Pantry Staples', slug: 'pantry-staples', parent: 'grocery-gourmet-food' },
  { name: 'Organic & Specialty Foods', slug: 'organic-specialty-foods', parent: 'grocery-gourmet-food' },

  // 15. Industrial & Scientific
  { name: 'Industrial & Scientific', slug: 'industrial-scientific', parent: null },
  { name: 'Lab & Scientific Products', slug: 'lab-scientific-products', parent: 'industrial-scientific' },
  { name: 'Professional Medical Supplies', slug: 'professional-medical-supplies', parent: 'industrial-scientific' },
  { name: 'Industrial Electrical', slug: 'industrial-electrical', parent: 'industrial-scientific' },
  { name: 'Safety & PPE', slug: 'safety-ppe', parent: 'industrial-scientific' },
]

async function seedCategories() {
  try {
    const payload = await getPayload({ config })
    console.log('✅ Payload initialized')

    const categoryMap = new Map()

  // First pass: Create all categories without parents
  for (const cat of amazonCategories) {
    if (cat.parent === null) {
      try {
        const result = await payload.create({
          collection: 'categories',
          data: {
            name: cat.name,
            slug: cat.slug,
          },
        })
        categoryMap.set(cat.slug, result.id)
        console.log(`✅ Created: ${cat.name}`)
      } catch (error) {
        if (error.message.includes('duplicate')) {
          // Category already exists, find it
          const existing = await payload.find({
            collection: 'categories',
            where: { slug: { equals: cat.slug } },
            limit: 1,
          })
          if (existing.docs.length > 0) {
            categoryMap.set(cat.slug, existing.docs[0].id)
            console.log(`⚠️  Already exists: ${cat.name}`)
          }
        } else {
          console.error(`❌ Error creating ${cat.name}:`, error.message)
        }
      }
    }
  }

  // Second pass: Create categories with parents
  for (const cat of amazonCategories) {
    if (cat.parent !== null) {
      const parentId = categoryMap.get(cat.parent)
      if (parentId) {
        try {
          const result = await payload.create({
            collection: 'categories',
            data: {
              name: cat.name,
              slug: cat.slug,
              parent: parentId,
            },
          })
          categoryMap.set(cat.slug, result.id)
          console.log(`✅ Created: ${cat.name} (child of ${cat.parent})`)
        } catch (error) {
          if (error.message.includes('duplicate')) {
            const existing = await payload.find({
              collection: 'categories',
              where: { slug: { equals: cat.slug } },
              limit: 1,
            })
            if (existing.docs.length > 0) {
              categoryMap.set(cat.slug, existing.docs[0].id)
              console.log(`⚠️  Already exists: ${cat.name}`)
            }
          } else {
            console.error(`❌ Error creating ${cat.name}:`, error.message)
          }
        }
      } else {
        console.error(`❌ Parent not found for ${cat.name}: ${cat.parent}`)
      }
    }
  }

    console.log('\n✅ Category seeding completed!')
    await payload.db.destroy()
    process.exit(0)
  } catch (error) {
    console.error('❌ Seeding failed:', error)
    console.error('\n💡 Make sure:')
    console.error('   1. Payload CMS server is running (npm run dev)')
    console.error('   2. .env.local file exists with DATABASE_URI and PAYLOAD_SECRET')
    console.error('   3. Or set environment variables: DATABASE_URI and PAYLOAD_SECRET')
    process.exit(1)
  }
}

seedCategories().catch((error) => {
  console.error('❌ Seeding failed:', error)
  process.exit(1)
})

