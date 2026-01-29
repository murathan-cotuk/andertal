'use client'

import { useState, useEffect } from 'react'
import { getMedusaClient } from '@/lib/medusa-client'

/**
 * Medusa products hook
 */
export function useMedusaProducts() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true)
        const client = getMedusaClient()
        const data = await client.getProducts()
        setProducts(data.products || [])
        setError(null)
      } catch (err) {
        console.error('Failed to fetch Medusa products:', err)
        setError(err.message)
        setProducts([])
      } finally {
        setLoading(false)
      }
    }

    fetchProducts()
  }, [])

  return { products, loading, error }
}

/**
 * Medusa cart hook
 */
export function useMedusaCart() {
  const [cart, setCart] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const createCart = async () => {
    try {
      setLoading(true)
      const client = getMedusaClient()
      const newCart = await client.createCart()
      setCart(newCart.cart)
      setError(null)
      return newCart.cart
    } catch (err) {
      console.error('Failed to create cart:', err)
      setError(err.message)
      return null
    } finally {
      setLoading(false)
    }
  }

  const addToCart = async (variantId, quantity = 1) => {
    if (!cart) {
      const newCart = await createCart()
      if (!newCart) return null
    }

    try {
      setLoading(true)
      const client = getMedusaClient()
      const updated = await client.addToCart(cart.id, variantId, quantity)
      setCart(updated.cart)
      setError(null)
      return updated.cart
    } catch (err) {
      console.error('Failed to add to cart:', err)
      setError(err.message)
      return null
    } finally {
      setLoading(false)
    }
  }

  return { cart, loading, error, createCart, addToCart }
}
