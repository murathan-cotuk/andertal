'use client'

import { useState } from 'react'
import { getMedusaClient } from '@/lib/medusa-client'

/**
 * Medusa customer authentication hook
 */
export function useMedusaAuth() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const register = async (email, password, firstName, lastName, extra = {}) => {
    try {
      setLoading(true)
      setError(null)
      const client = getMedusaClient()
      const result = await client.registerCustomer(email, password, firstName, lastName, extra)
      return result
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const login = async (email, password) => {
    try {
      setLoading(true)
      setError(null)
      const client = getMedusaClient()
      const result = await client.loginCustomer(email, password)
      return result
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const getCustomer = async (token) => {
    try {
      setLoading(true)
      setError(null)
      const client = getMedusaClient()
      const result = await client.getCustomer(token)
      return result
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { register, login, getCustomer, loading, error }
}
