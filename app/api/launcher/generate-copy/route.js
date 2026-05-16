import { NextResponse } from 'next/server'

const KIE_API_KEY = process.env.KIE_AI_KEY || ''
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''

// Helper: try Kie.ai's OpenAI-compatible Gemini endpoint
async function tryKieAi(prompt) {
  if (!KIE_API_KEY) return null
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 18000)
    const res = await fetch('https://api.kie.ai/gemini-2.5-flash/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KIE_API_KEY}` },
      body: JSON.stringify({
        model: 'gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)
    const data = await res.json()
    if (data.code && data.code !== 200) return null // Kie.ai error
    const text = data.choices?.[0]?.message?.content
    return text || null
  } catch {
    return null
  }
}

// Helper: try direct Google Gemini API
async function tryGemini(prompt) {
  if (!GEMINI_API_KEY) return null
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.85, maxOutputTokens: 1400 },
        }),
        signal: AbortSignal.timeout(15000),
      }
    )
    const data = await res.json()
    if (data.error) return null
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null
  } catch {
    return null
  }
}

// Smart template using scraped content — returns N variants
function buildSmartTemplate(pageContext, cta, variantCount = 3) {
  const ctaText = cta === 'ORDER_NOW' ? 'Order Now' : cta === 'SHOP_NOW' ? 'Shop Now' : 'Buy Now'

  // Only use words from actual page text (not URL)
  const isJustUrl = /^https?:\/\//.test(pageContext.trim())
  let productHint = 'यो उत्पादन'

  if (!isJustUrl) {
    const words = pageContext
      .replace(/https?:\/\/[^\s]+/g, '') // remove URLs
      .replace(/[^a-zA-Z0-9\u0900-\u097F\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !/^(https|www|com|html|http)$/i.test(w))
    if (words.length > 0) productHint = words.slice(0, 3).join(' ')
  }

  const HOOKS = [
    { open: `तपाईं पनि best deal को खोजीमा हुनुहुन्छ? 🤔\n🔥 ${productHint.toUpperCase()} — अहिले SPECIAL OFFER मा! 🔥`, headline: 'Free Delivery Nepal 🚚', desc: 'COD Available All Over Nepal' },
    { open: `के तपाईं यो product को साँचो price खोज्दै हुनुहुन्छ? 😍\n✨ ${productHint.toUpperCase()} — आजको HOT DEAL! ✨`, headline: 'COD All Over Nepal 📦', desc: 'Free Delivery + Quality' },
    { open: `यो किन यति trending छ Nepal मा? 👀\n⚡ ${productHint.toUpperCase()} — Limited Stock Sale! ⚡`, headline: 'Buy Now, Pay on Delivery', desc: '2-3 Day Delivery Nepal' },
    { open: `हजारौंले मन पराएको product 💯\n🔥 ${productHint.toUpperCase()} — Special Launch Price! 🔥`, headline: 'Trusted by 1000+ Nepal', desc: 'Cash on Delivery' },
    { open: `Special offer आज मात्र लाई! 🎉\n✨ ${productHint.toUpperCase()} — Don't miss out! ✨`, headline: 'Limited Time Offer 🇳🇵', desc: 'Free Delivery Nationwide' },
  ]

  const variants = []
  for (let i = 0; i < variantCount; i++) {
    const h = HOOKS[i % HOOKS.length]
    variants.push({
      primaryText: `${h.open}

💰 Limited-time price — सबैभन्दा सस्तो rate मा!

✅ 100% Original product
✅ नेपाल भरि Free Delivery 🇳🇵
✅ Easy to use, instant result
✅ हजारौंले प्रयोग गरिसकेका
✅ Quality Guarantee — पसन्द नभए return
✅ Hassle-free shopping experience

🚚 Cash on Delivery All Over Nepal
📦 2–3 दिनमा घर सम्म डेलिभरी

⭐ 1000+ खुसी customers across Nepal

⏰ Stock limited — आज मात्र offer!

👇 तलको "${ctaText}" button मा click गर्नुहोस्!
📞 अथवा call/WhatsApp गर्नुहोस्: 9704805104

#Nepal #CashOnDelivery #FreeDelivery #OnlineShopping`,
      headline: h.headline,
      description: h.desc,
    })
  }
  return variants
}

export async function POST(request) {
  try {
    const { landingUrl, objective, cta, variantCount: variantCountRaw } = await request.json()

    // Clamp variant count between 1 and 5 — more than that risks ad-count explosion downstream
    const variantCount = Math.max(1, Math.min(5, parseInt(variantCountRaw) || 3))

    if (!landingUrl) {
      return NextResponse.json({ success: false, error: 'landingUrl is required' }, { status: 400 })
    }

    // Fetch landing page content
    let pageContext = landingUrl
    try {
      const pageRes = await fetch(landingUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AdBot/1.0)' },
        signal: AbortSignal.timeout(8000),
      })
      const html = await pageRes.text()
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (text.length > 100) pageContext = text.substring(0, 3000)
    } catch (e) {
      console.log('[GenerateCopy] Could not fetch URL:', e.message)
    }

    const prompt = `You are a senior direct-response copywriter for Nepali e-commerce / drop-shipping ads on Facebook & Instagram.

PRODUCT INFORMATION (scraped from the landing page):
${pageContext}

Campaign Objective: ${objective || 'Sales'}
Call-to-Action Button: ${cta || 'Order Now'}

═══════════════════════════════════════════════════════════════
TASK: Write ${variantCount} DISTINCT ad-copy variants for the same product. These will run side-by-side as an A/B/C test, so each variant must use a DIFFERENT angle, hook, and headline. Do NOT just reword the same idea.

Try different angles across variants — for example: pain-point/problem-aware, social-proof/trending, scarcity/limited-time, transformation/before-after, curiosity/secret, lifestyle/aspiration. Pick whichever angles fit this product best.

Output ONLY a valid JSON object — NO markdown, NO code fences, NO explanation. Just raw JSON in this exact shape:
{"variants":[{"primaryText":"...","headline":"...","description":"..."}, ... ${variantCount} items total]}

══════════ PRIMARY TEXT (the caption) ══════════
Write it in this EXACT 8-block structure, each block separated by a blank line:

1) HOOK — open with a pain-point QUESTION the target customer instantly relates to, then on the next line drop an ALL-CAPS attention-grabber wrapped in 🔥/✨/⚡ emojis.
   Example:
   तपाईंको kitchen पनि चिल्लो र गनाउने भयो? 😩
   🔥 KITCHEN CLEAN गर्ने NEW WAY आयो! 🔥

2) OFFER — pull the real offer from the landing page text above (BOGO, % discount, bundle deal, etc.). Use price-anchoring format when possible:
   💰 ~~Rs 2,999~~ → अब मात्र Rs 999/- मा!
   🎁 Buy 1 Get 1 Free (if applicable)

3) BENEFITS — 5–6 short bullet points written FROM THE CUSTOMER'S PERSPECTIVE (what THEY get, not what the product is). Lead with ✅ emoji. Mix Nepali + English naturally.
   ✅ चिल्लो दाग 30 second मा सफा
   ✅ हात नदुख्ने gentle formula
   ✅ कुनै chemical smell छैन
   (etc.)

4) TRUST / RISK REVERSAL — include any that the landing page supports:
   🚚 Cash on Delivery All Over Nepal
   📦 2–3 दिनमा घर सम्म डेलिभरी
   ✅ Quality Guarantee — पसन्द नभए return
   (If COD or returns are not mentioned on the page, omit those specific lines.)

5) SOCIAL PROOF — one short line of credibility:
   ⭐ 1000+ खुसी customers across Nepal

6) URGENCY — one tight line that gives a reason to order NOW:
   ⏰ Stock limited — आज मात्र offer!
   🔥 Last few pieces बाँकी छन्

7) CTA — direct the reader to the Order Now button below the ad:
   👇 तलको "${cta === 'ORDER_NOW' ? 'Order Now' : cta === 'SHOP_NOW' ? 'Shop Now' : cta === 'BUY_NOW' ? 'Buy Now' : cta === 'GET_OFFER' ? 'Get Offer' : cta === 'LEARN_MORE' ? 'Learn More' : cta === 'SEND_MESSAGE' ? 'Send Message' : 'Order Now'}" button मा click गर्नुहोस्!
   📞 अथवा सिधै call/WhatsApp गर्नुहोस्: 9704805104

8) HASHTAGS — 3 to 4 only, lowercase or mixedCase, relevant to product + Nepal market:
   #Nepal #CashOnDelivery #FreeDelivery #<ProductCategory>

══════════ HARD RULES ══════════
• Mix Nepali (Devanagari) and English naturally — never write only one or only the other.
• Emojis: use sparingly and meaningfully. Roughly 1 per block. Don't spam.
• Short, scannable lines. No long paragraphs.
• Write benefits, not features. ("hands won't hurt" not "pH 7 formula")
• For HEALTH/BEAUTY products: never write "guaranteed cure", "100% results", "medicine". Use soft words: care, support, helps, may improve.
• If the landing page doesn't mention something (e.g. COD, BOGO, discount %), DO NOT fabricate it.
• Never use markdown bold (**text**) — Meta strips it. Use ALL CAPS or emoji wrap for emphasis.

══════════ HEADLINE (3–8 words, max 40 chars) ══════════
Quick benefit-driven punch. e.g. "30 Sec मा Kitchen Clean", "Free Delivery Nepal", "Buy 1 Get 1 Free".

══════════ DESCRIPTION (max 30 chars) ══════════
Short trust signal. e.g. "COD All Over Nepal", "Quality Guarantee".

Each of the three fields must do a DIFFERENT job — never copy text between them.`

    // Try AI providers in order
    let rawText = null

    rawText = await tryKieAi(prompt)
    console.log('[GenerateCopy] Kie.ai result:', rawText ? 'success' : 'failed/unavailable')

    if (!rawText) {
      rawText = await tryGemini(prompt)
      console.log('[GenerateCopy] Google Gemini result:', rawText ? 'success' : 'failed/unavailable')
    }

    // If AI works, parse the response
    if (rawText) {
      let clean = rawText.replace(/```json/gi, '').replace(/```/g, '').trim()
      const jsonMatch = clean.match(/\{[\s\S]*\}/)
      if (jsonMatch) clean = jsonMatch[0]
      try {
        const parsed = JSON.parse(clean)
        // Preferred shape: { variants: [{primaryText, headline, description}, ...] }
        const variants = Array.isArray(parsed.variants)
          ? parsed.variants
          // Backward-compatible: AI returned a single {primaryText, headline, description}
          : (parsed.primaryText && parsed.headline ? [parsed] : null)

        const cleaned = (variants || [])
          .filter(v => v && v.primaryText && v.headline)
          .slice(0, variantCount)
          .map(v => ({
            primaryText: String(v.primaryText),
            headline: String(v.headline),
            description: String(v.description || ''),
          }))

        if (cleaned.length > 0) {
          // If AI returned fewer than requested, pad from smart template so user always gets variantCount
          if (cleaned.length < variantCount) {
            const padding = buildSmartTemplate(pageContext, cta || 'Order Now', variantCount - cleaned.length)
            cleaned.push(...padding)
          }
          return NextResponse.json({ success: true, variants: cleaned })
        }
      } catch {
        // fall through to template
      }
    }

    // Smart fallback: template-based copy using landing page content
    console.log('[GenerateCopy] Using smart template fallback')
    const variants = buildSmartTemplate(pageContext, cta || 'Order Now', variantCount)
    return NextResponse.json({
      success: true,
      variants,
      note: '⚠️ AI temporarily unavailable — smart template used. Get a fresh Gemini API key at aistudio.google.com for AI copy.'
    })

  } catch (error) {
    console.error('[GenerateCopy] Error:', error.message)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
