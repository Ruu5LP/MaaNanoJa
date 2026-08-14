const SITE_ORIGIN = 'https://maananaja.final0505.workers.dev'

const HOME_DESCRIPTION =
  '麻雀の対局結果や局ログを記録し、合計スコア・順位・和了率などの成績を同じルームで共有できるWebアプリです。'

type PageKind = 'home' | 'privacy' | 'terms' | 'private'

const PAGE_METADATA: Record<
  PageKind,
  { title: string; description: string; path: string; robots: string }
> = {
  home: {
    title: '麻雀の対局記録・成績管理｜麻雀トラッカー',
    description: HOME_DESCRIPTION,
    path: '/',
    robots: 'index, follow',
  },
  privacy: {
    title: 'プライバシーポリシー｜麻雀トラッカー',
    description: '麻雀トラッカーにおける個人情報やCookieなどの取り扱いをご案内します。',
    path: '/privacy',
    robots: 'noindex, follow',
  },
  terms: {
    title: '利用規約｜麻雀トラッカー',
    description: '麻雀トラッカーの利用条件、禁止事項、免責事項などをご案内します。',
    path: '/terms',
    robots: 'noindex, follow',
  },
  private: {
    title: '共有ルーム｜麻雀トラッカー',
    description: '麻雀トラッカーの共有ルームです。',
    path: '/',
    robots: 'noindex, nofollow',
  },
}

function setMeta(attribute: 'name' | 'property', key: string, content: string): void {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, key)
    document.head.appendChild(element)
  }
  element.content = content
}

function setCanonical(url: string): void {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!element) {
    element = document.createElement('link')
    element.rel = 'canonical'
    document.head.appendChild(element)
  }
  element.href = url
}

export function setPageMetadata(page: PageKind): void {
  const metadata = PAGE_METADATA[page]
  const canonicalUrl = new URL(metadata.path, SITE_ORIGIN).toString()

  document.title = metadata.title
  setMeta('name', 'description', metadata.description)
  setMeta('name', 'robots', metadata.robots)
  setMeta('name', 'googlebot', metadata.robots)
  setMeta('property', 'og:title', metadata.title)
  setMeta('property', 'og:description', metadata.description)
  setMeta('property', 'og:url', canonicalUrl)
  setMeta('name', 'twitter:title', metadata.title)
  setMeta('name', 'twitter:description', metadata.description)
  setCanonical(canonicalUrl)
}
