const EU_ORIGIN_META_KEYS = [
  'eu_origin_provider',
  'eu_origin_registry_id',
  'eu_origin_document_url',
  'eu_origin_status',
  'eu_origin_verified_at',
  'eu_origin_country',
]

const EU_ORIGIN_STATUS = {
  NONE: '',
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
}

const EU_ORIGIN_PROTECTED_KEYS = ['eu_origin_status', 'eu_origin_verified_at']

module.exports = {
  EU_ORIGIN_META_KEYS,
  EU_ORIGIN_STATUS,
  EU_ORIGIN_PROTECTED_KEYS,
}
