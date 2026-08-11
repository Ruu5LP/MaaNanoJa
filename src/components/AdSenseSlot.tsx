import { useEffect, useRef } from 'react'

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

const ADSENSE_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT?.trim() ?? ''
const ADSENSE_LANDING_SLOT = import.meta.env.VITE_ADSENSE_LANDING_SLOT?.trim() ?? ''

/**
 * ランディングページ用の広告枠。
 * AdSenseの値が未設定なら何も描画しないため、開発環境や審査前の公開でも安全に使える。
 */
export default function AdSenseSlot() {
  const adRef = useRef<HTMLModElement>(null)

  useEffect(() => {
    if (!ADSENSE_CLIENT || !ADSENSE_LANDING_SLOT || !adRef.current) return

    const renderAd = () => {
      const ad = adRef.current
      if (!ad || ad.dataset.requested === 'true') return

      window.adsbygoogle = window.adsbygoogle ?? []
      ad.dataset.requested = 'true'
      window.adsbygoogle.push({})
    }

    let script = document.querySelector<HTMLScriptElement>('script[data-maananaja-adsense]')
    if (!script) {
      script = document.createElement('script')
      script.async = true
      script.crossOrigin = 'anonymous'
      script.dataset.maananajaAdsense = 'true'
      script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT)}`
      script.addEventListener(
        'load',
        () => {
          script?.setAttribute('data-loaded', 'true')
          renderAd()
        },
        { once: true },
      )
      document.head.appendChild(script)
    } else if (script.dataset.loaded === 'true' || window.adsbygoogle) {
      renderAd()
    } else {
      script.addEventListener('load', renderAd, { once: true })
    }
  }, [])

  if (!ADSENSE_CLIENT || !ADSENSE_LANDING_SLOT) return null

  return (
    <section className="ad-slot" aria-label="広告">
      <span className="ad-slot-label">広告</span>
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={ADSENSE_CLIENT}
        data-ad-slot={ADSENSE_LANDING_SLOT}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </section>
  )
}
