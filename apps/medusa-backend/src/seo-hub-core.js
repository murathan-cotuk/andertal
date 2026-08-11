'use strict'

/** Shared SEO hub helpers — analysis, length rules, H1 demotion, auto-meta. */

const TITLE_IDEAL = { min: 50, max: 65 }
const DESC_IDEAL = { min: 150, max: 300 }
const TITLE_SOFT = { min: 30, max: 70 }
const DESC_SOFT = { min: 70, max: 320 }

const stripHtml = (value) => String(value || '')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

/** Demote every H1 to H2 in HTML (product descriptions must not use H1). */
const demoteH1ToH2 = (html) => {
  if (html == null || typeof html !== 'string' || !html) return html
  return html
    .replace(/<\s*h1(\s[^>]*)?>/gi, '<h2$1>')
    .replace(/<\s*\/\s*h1\s*>/gi, '</h2>')
}

const countTags = (html, tag) => {
  const re = new RegExp(`<\\s*${tag}\\b`, 'gi')
  return (String(html || '').match(re) || []).length
}

const analyzeHtml = (html) => {
  const source = String(html || '')
  const headings = {
    h1: countTags(source, 'h1'),
    h2: countTags(source, 'h2'),
    h3: countTags(source, 'h3'),
    h4: countTags(source, 'h4'),
    h5: countTags(source, 'h5'),
    h6: countTags(source, 'h6'),
  }
  const images = countTags(source, 'img')
  const links = countTags(source, 'a')
  const imagesWithoutAlt = (source.match(/<img\b(?![^>]*\balt\s*=)[^>]*>/gi) || []).length
  return {
    headings,
    headingTotal: Object.values(headings).reduce((a, b) => a + b, 0),
    images,
    imagesWithoutAlt,
    links,
    plainLength: stripHtml(source).length,
    hasH1: headings.h1 > 0,
  }
}

const lengthStatus = (value, ideal, soft) => {
  const len = String(value || '').trim().length
  let status = 'ok'
  if (len === 0) status = 'missing'
  else if (len < ideal.min || len > ideal.max) {
    status = len < soft.min || len > soft.max ? 'error' : 'warn'
  }
  return { length: len, status, idealMin: ideal.min, idealMax: ideal.max }
}

const evaluateMeta = ({ title, description, keywords, entityType }) => {
  const titleEval = lengthStatus(title, TITLE_IDEAL, TITLE_SOFT)
  const descEval = lengthStatus(description, DESC_IDEAL, DESC_SOFT)
  const kw = String(keywords || '').trim()
  const keywordsEval = {
    length: kw.length,
    count: kw ? kw.split(/[,;]+/).map((s) => s.trim()).filter(Boolean).length : 0,
    status: kw ? 'ok' : 'missing',
  }
  const strictCategory = entityType === 'categories'
  const issues = []
  if (titleEval.status === 'missing') issues.push({ field: 'title', severity: 'error', message: 'Meta title is required' })
  else if (titleEval.status !== 'ok') {
    issues.push({
      field: 'title',
      // Length outside ideal is advisory — only missing title blocks category save (shop needs a value).
      severity: titleEval.status === 'error' && !strictCategory ? 'error' : 'warn',
      message: `Meta title should be ${TITLE_IDEAL.min}–${TITLE_IDEAL.max} characters (now ${titleEval.length})`,
    })
  }
  if (descEval.status === 'missing') issues.push({ field: 'description', severity: 'error', message: 'Meta description is required' })
  else if (descEval.status !== 'ok') {
    issues.push({
      field: 'description',
      severity: descEval.status === 'error' && !strictCategory ? 'error' : 'warn',
      message: `Meta description should be ${DESC_IDEAL.min}–${DESC_IDEAL.max} characters (now ${descEval.length})`,
    })
  }
  if (keywordsEval.status === 'missing') {
    issues.push({
      field: 'keywords',
      severity: 'warn',
      message: 'Keywords should be set (comma-separated)',
    })
  }
  return { title: titleEval, description: descEval, keywords: keywordsEval, issues }
}

const truncateAtWord = (text, max) => {
  const plain = String(text || '').trim()
  if (plain.length <= max) return plain
  const slice = plain.slice(0, max)
  const cut = slice.lastIndexOf(' ')
  return (cut > max * 0.6 ? slice.slice(0, cut) : slice).trim()
}

const padTitleToIdeal = (title) => {
  let t = String(title || '').trim()
  if (!t) return t
  if (t.length > TITLE_IDEAL.max) return truncateAtWord(t, TITLE_IDEAL.max)
  // Prefer staying in range; if short, leave as-is (caller may append brand)
  return t
}

const autoGenerateProductSeo = (product) => {
  const title = String(product?.title || '').trim()
  const plain = stripHtml(product?.description || '')
  let metaTitle = padTitleToIdeal(title)
  if (metaTitle.length < TITLE_IDEAL.min && metaTitle) {
    const suffix = ' | Andertal'
    const combined = `${metaTitle}${suffix}`
    metaTitle = combined.length <= TITLE_IDEAL.max ? combined : padTitleToIdeal(title)
  }
  let metaDescription = plain
  if (metaDescription.length > DESC_IDEAL.max) metaDescription = truncateAtWord(metaDescription, DESC_IDEAL.max)
  if (metaDescription.length < DESC_IDEAL.min && title) {
    const filler = `Jetzt ${title} bei Andertal entdecken. Qualität, schneller Versand und sicherer Kauf.`
    metaDescription = truncateAtWord(`${metaDescription ? `${metaDescription} ` : ''}${filler}`.trim(), DESC_IDEAL.max)
  }
  const words = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2)
  const keywords = [...new Set(words)].slice(0, 8).join(', ')
  return {
    seo_meta_title: metaTitle,
    seo_meta_description: metaDescription,
    seo_keywords: keywords,
  }
}

const normalizeEntityType = (value) => {
  const t = String(value || '').toLowerCase()
  if (['product', 'products'].includes(t)) return 'products'
  if (['category', 'categories'].includes(t)) return 'categories'
  if (['collection', 'collections'].includes(t)) return 'collections'
  if (['page', 'pages', 'cms'].includes(t)) return 'pages'
  if (['blog', 'blogs', 'blog-posts', 'blog_posts'].includes(t)) return 'blogs'
  return null
}

module.exports = {
  TITLE_IDEAL,
  DESC_IDEAL,
  stripHtml,
  demoteH1ToH2,
  analyzeHtml,
  evaluateMeta,
  autoGenerateProductSeo,
  normalizeEntityType,
}
