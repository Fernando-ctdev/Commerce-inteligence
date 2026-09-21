// Vitrine — mock de leitura com dados reais do response TikHub capturado na nota
// get-https-api-tikhub-io-ap-2 (só o allowlist abaixo; cookie, cache_url assinada,
// request_id e metadata operacional foram removidos; URL públicas preservadas).
// DTO transitório e somente leitura: nunca persiste, nunca autoriza, nunca substitui
// Product/Tenant/quota/job e nunca infere status. Sem description por design: o
// creator preenche na revisão manual.

export type ShowcaseLabel = {
  text?: string;
  icon?: string;
  theme: number;
  type: number;
};

export type ShowcaseAffiliateInfo = {
  estCommissionExpense: string;
  commissionWithCurrency: string;
  commissionRate: number;
  commissionExpense: number;
  commissionViewType: number;
};

export type ShowcaseItem = {
  id: string;
  title: string;
  coverUrl?: string;
  imageUrls?: string[];
  priceLabel?: string;
  categoryName?: string;
  sellerId?: string;
  sellerName?: string;
  stockCount?: number;
  /** Leitura remota exata de can_added; o mock não autoriza nada. */
  canAdd?: boolean;
  labels?: ShowcaseLabel[];
  affiliateInfo?: ShowcaseAffiliateInfo;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function firstHttpsUrl(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    const url = httpsUrl(item);
    if (url) return url;
  }
  return null;
}

function showcaseLabel(value: unknown): ShowcaseLabel | null {
  const label = record(value);
  if (!label || typeof label.theme !== "number" || typeof label.type !== "number") return null;
  return {
    ...(text(label.text) ? { text: text(label.text)! } : {}),
    ...(text(label.icon) ? { icon: text(label.icon)! } : {}),
    theme: label.theme,
    type: label.type,
  };
}

function showcaseAffiliateInfo(value: unknown): ShowcaseAffiliateInfo | null {
  const info = record(value);
  if (!info) return null;
  const estCommissionExpense = text(info.est_commission_expense);
  const commissionWithCurrency = text(info.commission_with_currency);
  if (
    estCommissionExpense === null ||
    commissionWithCurrency === null ||
    typeof info.commission_rate !== "number" ||
    typeof info.commission_expense !== "number" ||
    typeof info.commission_view_type !== "number"
  )
    return null;
  return {
    estCommissionExpense,
    commissionWithCurrency,
    commissionRate: info.commission_rate,
    commissionExpense: info.commission_expense,
    commissionViewType: info.commission_view_type,
  };
}

/** Allowlist do DTO: mapeia o shape TikHub para ShowcaseItem; campos inválidos ficam
 *  ausentes e chaves desconhecidas (source, review_status, is_hide, platform, ...)
 *  nunca cruzam. id/title ausentes rejeitam o item. */
export function toShowcaseItem(raw: unknown): ShowcaseItem | null {
  const source = record(raw);
  if (!source) return null;
  const id = text(source.product_id);
  const title = text(source.title);
  if (!id || !title) return null;
  const seller = record(source.seller_info);
  const category = record(source.category_info);
  const cover = record(source.cover);
  const coverUrl = firstHttpsUrl(cover?.url_list);
  const imageUrls = (Array.isArray(source.images) ? source.images : [])
    .map((image) => firstHttpsUrl(record(image)?.url_list))
    .filter((url): url is string => url !== null);
  const labels = (Array.isArray(source.labels) ? source.labels : [])
    .map(showcaseLabel)
    .filter((label): label is ShowcaseLabel => label !== null);
  const affiliateInfo = showcaseAffiliateInfo(source.affiliate_info);
  return {
    id,
    title,
    ...(coverUrl ? { coverUrl } : {}),
    ...(imageUrls.length > 0 ? { imageUrls } : {}),
    ...(text(source.format_available_price) ? { priceLabel: text(source.format_available_price)! } : {}),
    ...(text(category?.name) ? { categoryName: text(category?.name)! } : {}),
    ...(text(seller?.seller_id) ? { sellerId: text(seller?.seller_id)! } : {}),
    ...(text(seller?.shop_name) ? { sellerName: text(seller?.shop_name)! } : {}),
    ...(typeof source.stock_num === "number" && Number.isInteger(source.stock_num) && source.stock_num >= 0
      ? { stockCount: source.stock_num }
      : {}),
    ...(typeof source.can_added === "boolean" ? { canAdd: source.can_added } : {}),
    ...(labels.length > 0 ? { labels } : {}),
    ...(affiliateInfo ? { affiliateInfo } : {}),
  };
}

// Fixture real (allowlistado) na ordem original do response: 20 produtos.
const SHOWCASE_FIXTURES: readonly unknown[] = [
  {
    "product_id": "1734865245975577888",
    "title": "Vestido Longo Morcego Moda Feminina Indiano",
    "format_available_price": "R$ 109,99",
    "seller_info": {
      "seller_id": "7496183397605083424",
      "shop_name": "malikmodas"
    },
    "stock_num": 283,
    "can_added": true,
    "labels": [
      {
        "text": "31% off",
        "theme": 0,
        "type": 25
      }
    ],
    "category_info": {
      "name": "Womenswear & Underwear"
    },
    "affiliate_info": {
      "est_commission_expense": "R$ 9,90",
      "commission_with_currency": "R$ 9,90",
      "commission_rate": 900,
      "commission_expense": 9.9,
      "commission_view_type": 0
    },
    "cover": {
      "url_list": [
        "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/6a6e05a92caf4f43a1797581f0c74b05~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
        "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/6a6e05a92caf4f43a1797581f0c74b05~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
      ]
    },
    "images": [
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/6a6e05a92caf4f43a1797581f0c74b05~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/6a6e05a92caf4f43a1797581f0c74b05~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/94bc83fd0e6a413aa09eb50d77a0b3f7~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/94bc83fd0e6a413aa09eb50d77a0b3f7~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/057ec29e616e4919a5f66a3492a0883b~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/057ec29e616e4919a5f66a3492a0883b~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/8a002a80b85f433e8b8bb0fcacfbc20c~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/8a002a80b85f433e8b8bb0fcacfbc20c~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/5c31a628bbb64b5881892b9b7187d4bd~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/5c31a628bbb64b5881892b9b7187d4bd~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/1dc663e31aeb404aa6307b576fb8f1a2~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/1dc663e31aeb404aa6307b576fb8f1a2~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/0fc8f80ce75c414d872d42c581d10ab5~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/0fc8f80ce75c414d872d42c581d10ab5~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      }
    ]
  },
  {
    "product_id": "1733224446318643050",
    "title": "Whey Protein Concentrado 1kg Refil – 15g de Proteína Por Dose - FTW",
    "format_available_price": "R$ 78,90",
    "seller_info": {
      "seller_id": "7496167567122205546",
      "shop_name": "ftw.suplementos"
    },
    "stock_num": 1061,
    "can_added": true,
    "labels": [
      {
        "text": "Free sample",
        "icon": {
          "light_url": "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/free_sample.png~tplv-o3syd03w52-resize-image:72:72.image?dr=15586&t=555f072d&ps=933b5bde&shp=642850a0&shcp=5aca9457&idc=my&from=1680363680",
          "dark_url": "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/free_sample_dark.png~tplv-o3syd03w52-resize-image:72:72.image?dr=15586&t=555f072d&ps=933b5bde&shp=642850a0&shcp=5aca9457&idc=my&from=1680363680",
          "width": 11,
          "height": 11
        },
        "theme": 100,
        "type": 1
      },
      {
        "text": "41% off",
        "theme": 0,
        "type": 25
      }
    ],
    "category_info": {
      "name": "Health"
    },
    "affiliate_info": {
      "est_commission_expense": "R$ 9,47",
      "commission_with_currency": "R$ 9,47",
      "commission_rate": 1200,
      "commission_expense": 9.47,
      "commission_view_type": 0
    },
    "cover": {
      "url_list": [
        "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/cc3166a814864a2590eab2f94a6cece1~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
        "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/cc3166a814864a2590eab2f94a6cece1~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
      ]
    },
    "images": [
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/cc3166a814864a2590eab2f94a6cece1~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/cc3166a814864a2590eab2f94a6cece1~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/179dd179d39845d5bfdeb5d81ad1e1f0~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/179dd179d39845d5bfdeb5d81ad1e1f0~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/0224591b333d4f41b41897117ff420f6~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/0224591b333d4f41b41897117ff420f6~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/16be6a927bfd4eb0a9e6529564ad1a2c~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/16be6a927bfd4eb0a9e6529564ad1a2c~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      }
    ]
  },
  {
    "product_id": "1736304709470553818",
    "title": "Creatina Delicious Monohidratada 500g FTW",
    "format_available_price": "R$ 79,90",
    "seller_info": {
      "seller_id": "7494619893513946842",
      "shop_name": "emporioalphavp"
    },
    "stock_num": 14,
    "can_added": true,
    "category_info": {
      "name": "Health"
    },
    "affiliate_info": {
      "est_commission_expense": "R$ 4,00",
      "commission_with_currency": "R$ 4,00",
      "commission_rate": 500,
      "commission_expense": 4,
      "commission_view_type": 0
    },
    "cover": {
      "url_list": [
        "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/d46e8f4cce8f4dcbbecb99c6f3a55405~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
        "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/d46e8f4cce8f4dcbbecb99c6f3a55405~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
      ]
    },
    "images": [
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/d46e8f4cce8f4dcbbecb99c6f3a55405~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/d46e8f4cce8f4dcbbecb99c6f3a55405~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/a5047ce8bb1a417ea0fa18aeebff9b51~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/a5047ce8bb1a417ea0fa18aeebff9b51~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/94bb20aa1a3546aa9fd8837162caf266~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/94bb20aa1a3546aa9fd8837162caf266~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/1a5382c0b701465aa7373ede8bf3651b~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/1a5382c0b701465aa7373ede8bf3651b~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/d59b54dcf2584ad888b95da9c249e513~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/d59b54dcf2584ad888b95da9c249e513~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      }
    ]
  },
  {
    "product_id": "1736673359055521380",
    "title": "Conjunto Batinha e Short Infantil Menina Minimalista Toque Macio 1 2 4 6 Rosé Verde Off Bege",
    "format_available_price": "R$ 35,91",
    "seller_info": {
      "seller_id": "7494647565316949604",
      "shop_name": "usekamenkids0"
    },
    "stock_num": 9863,
    "can_added": true,
    "category_info": {
      "name": "Kids' Fashion"
    },
    "affiliate_info": {
      "est_commission_expense": "R$ 3,77",
      "commission_with_currency": "R$ 3,77",
      "commission_rate": 1050,
      "commission_expense": 3.77,
      "commission_view_type": 0
    },
    "cover": {
      "url_list": [
        "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/23300c3ab947430f827ad0b622bb7a60~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
        "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/23300c3ab947430f827ad0b622bb7a60~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
      ]
    },
    "images": [
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/23300c3ab947430f827ad0b622bb7a60~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/23300c3ab947430f827ad0b622bb7a60~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/1c4aed5dc0664a6c9ffccb0a35ac8541~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/1c4aed5dc0664a6c9ffccb0a35ac8541~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/97f6d9aa3b3d46228585c5da4698d735~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/97f6d9aa3b3d46228585c5da4698d735~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/dca039f09f184a24950c9bd8dd0a99b9~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/dca039f09f184a24950c9bd8dd0a99b9~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/2838f3b1939b48aca34ed45e39da1952~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/2838f3b1939b48aca34ed45e39da1952~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/7a056e1955a04ca3b27d4708b2f7d93f~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/7a056e1955a04ca3b27d4708b2f7d93f~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/821389e9731c45c9a283f2224c0669a9~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/821389e9731c45c9a283f2224c0669a9~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/74623465fbc243a0ad5a88592c600ebf~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/74623465fbc243a0ad5a88592c600ebf~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/4b7628caf091421aa544d5c9e715f091~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/4b7628caf091421aa544d5c9e715f091~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      }
    ]
  },
  {
    "product_id": "1733261925401462774",
    "title": "Mise en Scene Original Serum 30ml Oleo capilar",
    "format_available_price": "R$ 79,99",
    "seller_info": {
      "seller_id": "7494250815886362614",
      "shop_name": "aimicosmeticosoficial"
    },
    "stock_num": 84,
    "can_added": true,
    "labels": [
      {
        "text": "38% off",
        "theme": 0,
        "type": 25
      },
      {
        "theme": 0,
        "type": 34
      }
    ],
    "category_info": {
      "name": "Beauty & Personal Care"
    },
    "affiliate_info": {
      "est_commission_expense": "R$ 8,00",
      "commission_with_currency": "R$ 8,00",
      "commission_rate": 1000,
      "commission_expense": 8,
      "commission_view_type": 0
    },
    "cover": {
      "url_list": [
        "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/dc2a99d4af054b88be5b881c2d6d1a40~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
        "https://p19-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/dc2a99d4af054b88be5b881c2d6d1a40~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
      ]
    },
    "images": [
      {
        "url_list": [
          "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/dc2a99d4af054b88be5b881c2d6d1a40~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/dc2a99d4af054b88be5b881c2d6d1a40~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/4cb5b99640b447caafc9c0a5e2f0719f~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/4cb5b99640b447caafc9c0a5e2f0719f~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/9f7082e25b9f48cca68fae582e6f1301~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/9f7082e25b9f48cca68fae582e6f1301~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      }
    ]
  },
  {
    "product_id": "1731350467850175545",
    "title": "Camiseta Básica Tech Daily Insider",
    "format_available_price": "R$ 85,00",
    "seller_info": {
      "seller_id": "7496160045698025529",
      "shop_name": "insiderstoreoficial"
    },
    "stock_num": 22890,
    "can_added": true,
    "labels": [
      {
        "text": "39% off",
        "theme": 0,
        "type": 25
      },
      {
        "theme": 0,
        "type": 34
      }
    ],
    "category_info": {
      "name": "Menswear & Underwear"
    },
    "affiliate_info": {
      "est_commission_expense": "R$ 8,50",
      "commission_with_currency": "R$ 8,50",
      "commission_rate": 1000,
      "commission_expense": 8.5,
      "commission_view_type": 0
    },
    "cover": {
      "url_list": [
        "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/af3fa46979394e418f352685dd01dd3c~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
        "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/af3fa46979394e418f352685dd01dd3c~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
      ]
    },
    "images": [
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/af3fa46979394e418f352685dd01dd3c~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/af3fa46979394e418f352685dd01dd3c~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/af1d820754494321b4a032c73de2d4fe~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/af1d820754494321b4a032c73de2d4fe~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/1057c5980b454a69b76aa694bb207500~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/1057c5980b454a69b76aa694bb207500~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/7e0d19d312234d9d969f37610108cb90~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/7e0d19d312234d9d969f37610108cb90~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/82db450712ba4245b17c38bad2d84b99~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/82db450712ba4245b17c38bad2d84b99~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/0605f663a3db481f9cb0bfe59d27de5e~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/0605f663a3db481f9cb0bfe59d27de5e~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      }
    ]
  },
  {
    "product_id": "1737256358606898667",
    "title": "ARARA SPORT Legging De Treino Cintura Alta Com Bolso Lateral Poliamida Lisa Zero Transparente Conforto Estilo",
    "format_available_price": "R$ 79,94",
    "seller_info": {
      "seller_id": "7496205123342666219",
      "shop_name": "ararasport_oficial"
    },
    "stock_num": 341,
    "can_added": true,
    "labels": [
      {
        "text": "53% off",
        "theme": 0,
        "type": 25
      }
    ],
    "category_info": {
      "name": "Sports & Outdoor"
    },
    "affiliate_info": {
      "est_commission_expense": "R$ 7,99",
      "commission_with_currency": "R$ 7,99",
      "commission_rate": 1000,
      "commission_expense": 7.99,
      "commission_view_type": 0
    },
    "cover": {
      "url_list": [
        "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/c19081fd9be14fbe80f96d61c550bbaa~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
        "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/c19081fd9be14fbe80f96d61c550bbaa~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
      ]
    },
    "images": [
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/c19081fd9be14fbe80f96d61c550bbaa~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/c19081fd9be14fbe80f96d61c550bbaa~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/713737507c1d4fe193931f3a88571916~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/713737507c1d4fe193931f3a88571916~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/c84156fddc854cf5bea7535773c1f4da~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/c84156fddc854cf5bea7535773c1f4da~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/787f546e5d6c4809b2c6bcedaaa2bc5f~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/787f546e5d6c4809b2c6bcedaaa2bc5f~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/e6284f7047d04d7d80a42cf909ad1084~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/e6284f7047d04d7d80a42cf909ad1084~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/9c35de4bee714f6182d6b0a1b6761dd0~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/9c35de4bee714f6182d6b0a1b6761dd0~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/2e95a37e88844a78ad7a5c8315afbe33~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/2e95a37e88844a78ad7a5c8315afbe33~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/96cd855213c44ac6b81b13db457aa900~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/96cd855213c44ac6b81b13db457aa900~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/df0f83b214eb41f8be92975d6dd02cbe~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/df0f83b214eb41f8be92975d6dd02cbe~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      }
    ]
  },
  {
    "product_id": "1736038596152231234",
    "title": "VOID-GO Tênis Esportivo Unissex Masculino Feminino Academia Treino Corrida Caminhada Antiderrapante [Jª]",
    "format_available_price": "R$ 159,90",
    "seller_info": {
      "seller_id": "7494632568004773186",
      "shop_name": "ulli.shop"
    },
    "stock_num": 2639,
    "can_added": true,
    "category_info": {
      "name": "Sports & Outdoor"
    },
    "affiliate_info": {
      "est_commission_expense": "R$ 16,79",
      "commission_with_currency": "R$ 16,79",
      "commission_rate": 1050,
      "commission_expense": 16.79,
      "commission_view_type": 0
    },
    "cover": {
      "url_list": [
        "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/161fe420482f4f4f8e3b8c5f972a819d~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
        "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/161fe420482f4f4f8e3b8c5f972a819d~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
      ]
    },
    "images": [
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/161fe420482f4f4f8e3b8c5f972a819d~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/161fe420482f4f4f8e3b8c5f972a819d~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/d2cd2599e8d44b7688ae2806736fc39b~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/d2cd2599e8d44b7688ae2806736fc39b~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/bf5c10bac3814c8fb647d2a8654508c0~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/bf5c10bac3814c8fb647d2a8654508c0~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/3c03899ec20646268399118c2afbab44~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/3c03899ec20646268399118c2afbab44~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      }
    ]
  },
  {
    "product_id": "1734328035909666488",
    "title": "Sapato Lóris Shoes Feminino Sapatilha Slingback Rasteira Bico Fino Fivelas Mule Social Casual 6773",
    "format_available_price": "R$ 82,99",
    "seller_info": {
      "seller_id": "7496154071388818104",
      "shop_name": "lorizzeoficial"
    },
    "stock_num": 13689,
    "can_added": true,
    "labels": [
      {
        "text": "Free sample",
        "icon": {
          "light_url": "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/free_sample.png~tplv-o3syd03w52-resize-image:72:72.image?dr=15586&t=555f072d&ps=933b5bde&shp=642850a0&shcp=5aca9457&idc=my&from=1680363680",
          "dark_url": "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/free_sample_dark.png~tplv-o3syd03w52-resize-image:72:72.image?dr=15586&t=555f072d&ps=933b5bde&shp=642850a0&shcp=5aca9457&idc=my&from=1680363680",
          "width": 11,
          "height": 11
        },
        "theme": 100,
        "type": 1
      }
    ],
    "category_info": {
      "name": "Shoes"
    },
    "affiliate_info": {
      "est_commission_expense": "R$ 6,64",
      "commission_with_currency": "R$ 6,64",
      "commission_rate": 800,
      "commission_expense": 6.64,
      "commission_view_type": 0
    },
    "cover": {
      "url_list": [
        "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/c2665ae41e5e4108a43f11ae595dffab~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
        "https://p19-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/c2665ae41e5e4108a43f11ae595dffab~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
      ]
    },
    "images": [
      {
        "url_list": [
          "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/c2665ae41e5e4108a43f11ae595dffab~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/c2665ae41e5e4108a43f11ae595dffab~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/4ad2236908de4e04b3b1de507fd5b6e9~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/4ad2236908de4e04b3b1de507fd5b6e9~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/9c8d7a9467ec4c41b0a2b98cb81477c2~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/9c8d7a9467ec4c41b0a2b98cb81477c2~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/7a2ef4b2a5c34679b232339657b5e8c6~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/7a2ef4b2a5c34679b232339657b5e8c6~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/d849fe008aa54fe0acc94cb1b4aa1af7~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/d849fe008aa54fe0acc94cb1b4aa1af7~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/1145457f5abf46aba8cb37919c2aeb98~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/1145457f5abf46aba8cb37919c2aeb98~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/e730a441c9974c26ab4c3b8622c6c816~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/e730a441c9974c26ab4c3b8622c6c816~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/3f8899d965fa4ea79c7d892569f08e9b~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/3f8899d965fa4ea79c7d892569f08e9b~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      }
    ]
  },
  {
    "product_id": "1734384541758031601",
    "title": "Conjunto Feminino Calca Pantalona Wide Leg Cintura Alta com bolso e Blusa Cropped Tecido Viscolinho forrado Elástico na Cintura Sofisticação e Conforto",
    "format_available_price": "R$ 64,00",
    "seller_info": {
      "seller_id": "7494409705586394865",
      "shop_name": "ysa81981"
    },
    "stock_num": 159,
    "can_added": true,
    "labels": [
      {
        "text": "36% off",
        "theme": 0,
        "type": 25
      }
    ],
    "category_info": {
      "name": "Womenswear & Underwear"
    },
    "affiliate_info": {
      "est_commission_expense": "R$ 6,72",
      "commission_with_currency": "R$ 6,72",
      "commission_rate": 1050,
      "commission_expense": 6.72,
      "commission_view_type": 0
    },
    "cover": {
      "url_list": [
        "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/ec007d8d5bf2479a9b0c39c903e0156f~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
        "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/ec007d8d5bf2479a9b0c39c903e0156f~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
      ]
    },
    "images": [
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/ec007d8d5bf2479a9b0c39c903e0156f~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/ec007d8d5bf2479a9b0c39c903e0156f~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/d3027a98a81a42cfb9798a84ea17a894~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/d3027a98a81a42cfb9798a84ea17a894~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/a8991d7fad58411293a779e47d748831~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/a8991d7fad58411293a779e47d748831~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/eb0f980e5dd64c21ac4b537c00769b3b~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/eb0f980e5dd64c21ac4b537c00769b3b~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/e602c5f901f4499eb6ee71a50158ae1c~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/e602c5f901f4499eb6ee71a50158ae1c~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/3fb3a5743d66494aafdfce9cb8dee45a~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/3fb3a5743d66494aafdfce9cb8dee45a~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/9b61e37476da4bc19cde700e7b798f34~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/9b61e37476da4bc19cde700e7b798f34~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/c621cf5f0d034de0bc5c3110252bbecb~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/c621cf5f0d034de0bc5c3110252bbecb~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      }
    ]
  },
  {
    "product_id": "1732390649763300415",
    "title": "Kit Com 3 Body Bodi Bori Collant Feminino Básico Com Decote Quadrado Regata Regatinha Casual Versátil Têndencia Moda Blogueira",
    "format_available_price": "R$ 66,99",
    "seller_info": {
      "seller_id": "7496288411326384191",
      "shop_name": "gelmodass"
    },
    "stock_num": 124378,
    "can_added": true,
    "labels": [
      {
        "text": "Free sample",
        "icon": {
          "light_url": "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/free_sample.png~tplv-o3syd03w52-resize-image:72:72.image?dr=15586&t=555f072d&ps=933b5bde&shp=642850a0&shcp=5aca9457&idc=my&from=1680363680",
          "dark_url": "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/free_sample_dark.png~tplv-o3syd03w52-resize-image:72:72.image?dr=15586&t=555f072d&ps=933b5bde&shp=642850a0&shcp=5aca9457&idc=my&from=1680363680",
          "width": 11,
          "height": 11
        },
        "theme": 100,
        "type": 1
      }
    ],
    "category_info": {
      "name": "Womenswear & Underwear"
    },
    "affiliate_info": {
      "est_commission_expense": "R$ 3,35",
      "commission_with_currency": "R$ 3,35",
      "commission_rate": 500,
      "commission_expense": 3.35,
      "commission_view_type": 0
    },
    "cover": {
      "url_list": [
        "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/c369e9dcbfab405e98abd0fc19e448f3~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
        "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/c369e9dcbfab405e98abd0fc19e448f3~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
      ]
    },
    "images": [
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/c369e9dcbfab405e98abd0fc19e448f3~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/c369e9dcbfab405e98abd0fc19e448f3~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/0ed1d13760554a6a9ddaedff1f9cc12c~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/0ed1d13760554a6a9ddaedff1f9cc12c~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/4b6a4c2025ba409dbc59f8d4691432ed~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/4b6a4c2025ba409dbc59f8d4691432ed~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/1e635e1a88bf4082a95d185df16121e7~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/1e635e1a88bf4082a95d185df16121e7~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/ab0a22d1f1bf42efb69fbcb98de71805~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/ab0a22d1f1bf42efb69fbcb98de71805~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/4043e0d43e0041a49d0bc295257cd2fa~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/4043e0d43e0041a49d0bc295257cd2fa~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/e36879bd1290451abc16fa3a2495a0be~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/e36879bd1290451abc16fa3a2495a0be~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/27c26ad0a54a4f9d8a828ed834538984~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/27c26ad0a54a4f9d8a828ed834538984~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/641d85539a664e05b0792c2fbfdcb312~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/641d85539a664e05b0792c2fbfdcb312~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      }
    ]
  },
  {
    "product_id": "1733074992849847552",
    "title": "Camisa Social Feminino Com botão dourado Tecido Crepe Seda",
    "format_available_price": "R$ 34,99",
    "seller_info": {
      "seller_id": "7494233064631469312",
      "shop_name": "zulma.modas"
    },
    "stock_num": 281,
    "can_added": true,
    "labels": [
      {
        "text": "Free sample",
        "icon": {
          "light_url": "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/free_sample.png~tplv-o3syd03w52-resize-image:72:72.image?dr=15586&t=555f072d&ps=933b5bde&shp=642850a0&shcp=5aca9457&idc=my&from=1680363680",
          "dark_url": "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/free_sample_dark.png~tplv-o3syd03w52-resize-image:72:72.image?dr=15586&t=555f072d&ps=933b5bde&shp=642850a0&shcp=5aca9457&idc=my&from=1680363680",
          "width": 11,
          "height": 11
        },
        "theme": 100,
        "type": 1
      }
    ],
    "category_info": {
      "name": "Womenswear & Underwear"
    },
    "affiliate_info": {
      "est_commission_expense": "R$ 4,20",
      "commission_with_currency": "R$ 4,20",
      "commission_rate": 1200,
      "commission_expense": 4.2,
      "commission_view_type": 0
    },
    "cover": {
      "url_list": [
        "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/bba88ec704a4455ca677cf2e1b6097a1~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
        "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/bba88ec704a4455ca677cf2e1b6097a1~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
      ]
    },
    "images": [
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/bba88ec704a4455ca677cf2e1b6097a1~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/bba88ec704a4455ca677cf2e1b6097a1~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/87b62ea2d6cf4a57ad44ebab0e0c286c~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/87b62ea2d6cf4a57ad44ebab0e0c286c~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/34b641e9656c433f96e102727bce5ca5~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/34b641e9656c433f96e102727bce5ca5~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/64f88a02a5ba42edb105af8d0cc152e7~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/64f88a02a5ba42edb105af8d0cc152e7~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/5cbcaab98bc643db8c682c8c0f6263ba~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/5cbcaab98bc643db8c682c8c0f6263ba~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/e356b92261b0439f8c0a9ad52cd8ca94~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/e356b92261b0439f8c0a9ad52cd8ca94~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/fd3fae99b7ff443ab99758e13cc31c05~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/fd3fae99b7ff443ab99758e13cc31c05~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/5e4c2f77f86e420f8c5d125bc89be618~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/5e4c2f77f86e420f8c5d125bc89be618~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      }
    ]
  },
  {
    "product_id": "1736172034447868972",
    "title": "calça pantalona virginia vi color cos dublo tendência 2026 tecido sensorial marrant casual fechamento lateral",
    "format_available_price": "R$ 63,60",
    "seller_info": {
      "seller_id": "7494378454736208940",
      "shop_name": "jazzi_fashion"
    },
    "stock_num": 1605,
    "can_added": true,
    "labels": [
      {
        "text": "Free sample",
        "icon": {
          "light_url": "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/free_sample.png~tplv-o3syd03w52-resize-image:72:72.image?dr=15586&t=555f072d&ps=933b5bde&shp=642850a0&shcp=5aca9457&idc=my&from=1680363680",
          "dark_url": "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/free_sample_dark.png~tplv-o3syd03w52-resize-image:72:72.image?dr=15586&t=555f072d&ps=933b5bde&shp=642850a0&shcp=5aca9457&idc=my&from=1680363680",
          "width": 11,
          "height": 11
        },
        "theme": 100,
        "type": 1
      },
      {
        "text": "47% off",
        "theme": 0,
        "type": 25
      }
    ],
    "category_info": {
      "name": "Womenswear & Underwear"
    },
    "affiliate_info": {
      "est_commission_expense": "R$ 6,68",
      "commission_with_currency": "R$ 6,68",
      "commission_rate": 1050,
      "commission_expense": 6.68,
      "commission_view_type": 0
    },
    "cover": {
      "url_list": [
        "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/f50793cf9d414d0bb7658388e49e7a7c~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
        "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/f50793cf9d414d0bb7658388e49e7a7c~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
      ]
    },
    "images": [
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/f50793cf9d414d0bb7658388e49e7a7c~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/f50793cf9d414d0bb7658388e49e7a7c~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/43bce25e09ad42ec9b480fe4caf7ee68~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/43bce25e09ad42ec9b480fe4caf7ee68~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/17ed718854564e57ac93ce2759f8826a~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/17ed718854564e57ac93ce2759f8826a~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/d4deb267f7074e3196042c7f8e0c5de2~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/d4deb267f7074e3196042c7f8e0c5de2~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/5ee18d51c43149059d31834b5e351e3a~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/5ee18d51c43149059d31834b5e351e3a~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/ba39d4f1264c42c9a3ade102d91bb79d~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/ba39d4f1264c42c9a3ade102d91bb79d~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/dbb138336a424249b075c4ca71c136bf~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/dbb138336a424249b075c4ca71c136bf~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/95cae99f46e5428b9a4fa51442ee41b9~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/95cae99f46e5428b9a4fa51442ee41b9~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/12e3fd1c09a4472eaf0e079147cacd05~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/12e3fd1c09a4472eaf0e079147cacd05~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      }
    ]
  },
  {
    "product_id": "1733261213619029438",
    "title": "Base Matte Alta Cobertura Payot",
    "format_available_price": "R$ 55,71",
    "seller_info": {
      "seller_id": "7496211411023464894",
      "shop_name": "payotbrasil"
    },
    "stock_num": 2398,
    "can_added": true,
    "labels": [
      {
        "text": "Free sample",
        "icon": {
          "light_url": "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/free_sample.png~tplv-o3syd03w52-resize-image:72:72.image?dr=15586&t=555f072d&ps=933b5bde&shp=642850a0&shcp=5aca9457&idc=my&from=1680363680",
          "dark_url": "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/free_sample_dark.png~tplv-o3syd03w52-resize-image:72:72.image?dr=15586&t=555f072d&ps=933b5bde&shp=642850a0&shcp=5aca9457&idc=my&from=1680363680",
          "width": 11,
          "height": 11
        },
        "theme": 100,
        "type": 1
      }
    ],
    "category_info": {
      "name": "Beauty & Personal Care"
    },
    "affiliate_info": {
      "est_commission_expense": "R$ 6,13",
      "commission_with_currency": "R$ 6,13",
      "commission_rate": 1100,
      "commission_expense": 6.13,
      "commission_view_type": 0
    },
    "cover": {
      "url_list": [
        "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/0d8e3067c7fb4b21a2c5c9d5a3b536ab~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
        "https://p19-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/0d8e3067c7fb4b21a2c5c9d5a3b536ab~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
      ]
    },
    "images": [
      {
        "url_list": [
          "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/0d8e3067c7fb4b21a2c5c9d5a3b536ab~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/0d8e3067c7fb4b21a2c5c9d5a3b536ab~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/640e0de0e97c40d080f4ee50b5ee6674~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/640e0de0e97c40d080f4ee50b5ee6674~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/01ffd1b5c50d4363ad7051718a7d4f19~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/01ffd1b5c50d4363ad7051718a7d4f19~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/f7fd978e2ef64db5a9cabadaa95f6ab1~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/f7fd978e2ef64db5a9cabadaa95f6ab1~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/ce6db99f062246c396633d2e30cb66dc~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/ce6db99f062246c396633d2e30cb66dc~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/f48c5ba53da644e29658f57bc8abd3cd~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/f48c5ba53da644e29658f57bc8abd3cd~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/b9640c1613a54ce49743a2a7c74867ef~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/b9640c1613a54ce49743a2a7c74867ef~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/2abd876e7a6e4b85a0e78432dc1dde0f~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/2abd876e7a6e4b85a0e78432dc1dde0f~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/4326995dd9fd46d5841472990a2732b7~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/4326995dd9fd46d5841472990a2732b7~tplv-o3syd03w52-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      }
    ]
  },
  {
    "product_id": "1735829028666574315",
    "title": "Exclusiva Live ARARA SPORT KIT 2 Calça Legging Canelada Poliamida Sem Costura Sem Empina Cintura Alta Zero Transparente Para Academia Dia A Dia",
    "format_available_price": "R$ 89,90",
    "seller_info": {
      "seller_id": "7496205123342666219",
      "shop_name": "ararasport_oficial"
    },
    "stock_num": 39130,
    "can_added": true,
    "labels": [
      {
        "text": "70% off",
        "theme": 0,
        "type": 25
      },
      {
        "theme": 0,
        "type": 34
      }
    ],
    "category_info": {
      "name": "Sports & Outdoor"
    },
    "affiliate_info": {
      "est_commission_expense": "R$ 8,99",
      "commission_with_currency": "R$ 8,99",
      "commission_rate": 1000,
      "commission_expense": 8.99,
      "commission_view_type": 0
    },
    "cover": {
      "url_list": [
        "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/6ef93aeab82d4358bd23b1d718a2158a~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
        "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/6ef93aeab82d4358bd23b1d718a2158a~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
      ]
    },
    "images": [
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/6ef93aeab82d4358bd23b1d718a2158a~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/6ef93aeab82d4358bd23b1d718a2158a~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/cc023515ff7143768b73dec9165bcfc4~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/cc023515ff7143768b73dec9165bcfc4~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/f3b98aa7daed4e32863a6146ff30237a~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/f3b98aa7daed4e32863a6146ff30237a~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/8178ec32a95d490aae16ce518e8c9fda~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/8178ec32a95d490aae16ce518e8c9fda~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/66ff36efc882492dbc21a4298b3c3d57~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/66ff36efc882492dbc21a4298b3c3d57~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/d9d94ef1158e4a3cb92a8e6278dfa52b~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/d9d94ef1158e4a3cb92a8e6278dfa52b~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/985f429361fd488ca6f3f1c3dde8f249~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/985f429361fd488ca6f3f1c3dde8f249~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      }
    ]
  },
  {
    "product_id": "1734149141787542820",
    "title": "Blusa Social Feminina de Manga Longa em Tecido Suave e Confortável para Uso Diário Estilo Elegante e Conforto O Dia Todo",
    "format_available_price": "R$ 64,99",
    "seller_info": {
      "seller_id": "7494171996263974180",
      "shop_name": "hs.modas"
    },
    "stock_num": 8711,
    "can_added": true,
    "labels": [
      {
        "theme": 0,
        "type": 34
      }
    ],
    "category_info": {
      "name": "Womenswear & Underwear"
    },
    "affiliate_info": {
      "est_commission_expense": "R$ 6,50",
      "commission_with_currency": "R$ 6,50",
      "commission_rate": 1000,
      "commission_expense": 6.5,
      "commission_view_type": 0
    },
    "cover": {
      "url_list": [
        "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/f7f49624ddd445d39b63e867c92685c0~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
        "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/f7f49624ddd445d39b63e867c92685c0~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
      ]
    },
    "images": [
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/f7f49624ddd445d39b63e867c92685c0~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/f7f49624ddd445d39b63e867c92685c0~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/f24d43c4cea642e2b1c4f8db7fc7dbcd~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/f24d43c4cea642e2b1c4f8db7fc7dbcd~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/bce53e7e661746f69b4141efd1240dfa~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/bce53e7e661746f69b4141efd1240dfa~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/a51619435f7e4e32a5f94d4f2927fdab~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/a51619435f7e4e32a5f94d4f2927fdab~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/50b5d48b7c5c46f891ddf6f1e5d84707~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/50b5d48b7c5c46f891ddf6f1e5d84707~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/6d8a73537a384327bd58426baf39b98c~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/6d8a73537a384327bd58426baf39b98c~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/85428a4b2ff149d3a59af795c5c1e904~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/85428a4b2ff149d3a59af795c5c1e904~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/66ff536da9614d68818f41d6154dc61a~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/66ff536da9614d68818f41d6154dc61a~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/a20afccf4a4d49b1aa3cef1cbf2fb6ed~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/a20afccf4a4d49b1aa3cef1cbf2fb6ed~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      }
    ]
  },
  {
    "product_id": "1731952935071351897",
    "title": "Camisa Listrada Social Manga Longa Tendência 2025 com Abotoamento Frontal Com Gola e Calçado Casual Respirável",
    "format_available_price": "R$ 34,90",
    "seller_info": {
      "seller_id": "7496269976030906457",
      "shop_name": "wolmns_moda"
    },
    "stock_num": 1303,
    "can_added": true,
    "labels": [
      {
        "text": "Free sample",
        "icon": {
          "light_url": "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/free_sample.png~tplv-o3syd03w52-resize-image:72:72.image?dr=15586&t=555f072d&ps=933b5bde&shp=642850a0&shcp=5aca9457&idc=my&from=1680363680",
          "dark_url": "https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/free_sample_dark.png~tplv-o3syd03w52-resize-image:72:72.image?dr=15586&t=555f072d&ps=933b5bde&shp=642850a0&shcp=5aca9457&idc=my&from=1680363680",
          "width": 11,
          "height": 11
        },
        "theme": 100,
        "type": 1
      },
      {
        "text": "59% off",
        "theme": 0,
        "type": 25
      }
    ],
    "category_info": {
      "name": "Womenswear & Underwear"
    },
    "affiliate_info": {
      "est_commission_expense": "R$ 3,14",
      "commission_with_currency": "R$ 3,14",
      "commission_rate": 900,
      "commission_expense": 3.14,
      "commission_view_type": 0
    },
    "cover": {
      "url_list": [
        "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/402d69a7752541aa8b0c4bfca6d8bc75~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
        "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/402d69a7752541aa8b0c4bfca6d8bc75~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
      ]
    },
    "images": [
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/402d69a7752541aa8b0c4bfca6d8bc75~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/402d69a7752541aa8b0c4bfca6d8bc75~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/dfaa190e17e64c24a0f16e0ce7260208~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/dfaa190e17e64c24a0f16e0ce7260208~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/e66d14b678c846fd8636454806463a71~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/e66d14b678c846fd8636454806463a71~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/d4711d9209ad4566a544bbff68d68fec~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/d4711d9209ad4566a544bbff68d68fec~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/61d594f02a884972b3160ddc3d07aa6f~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/61d594f02a884972b3160ddc3d07aa6f~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/9fb6a9e2c201429cb0731a1239824385~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/9fb6a9e2c201429cb0731a1239824385~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/bb7db288d2aa4fdaafa424f4dad20bc8~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/bb7db288d2aa4fdaafa424f4dad20bc8~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/947f8eab02c7442fbdc1fac66907eb3c~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/947f8eab02c7442fbdc1fac66907eb3c~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      }
    ]
  },
  {
    "product_id": "1735634627786475262",
    "title": "Camisa Feminina Crepe Manga Bufante Punho Longo Botões forrado",
    "format_available_price": "R$ 52,00",
    "seller_info": {
      "seller_id": "7496185461311834878",
      "shop_name": "silvia.loja79"
    },
    "stock_num": 689,
    "can_added": true,
    "labels": [
      {
        "theme": 0,
        "type": 34
      }
    ],
    "category_info": {
      "name": "Womenswear & Underwear"
    },
    "affiliate_info": {
      "est_commission_expense": "R$ 5,20",
      "commission_with_currency": "R$ 5,20",
      "commission_rate": 1000,
      "commission_expense": 5.2,
      "commission_view_type": 0
    },
    "cover": {
      "url_list": [
        "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/737896682be649f6a9e99bf017431e4a~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
        "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/737896682be649f6a9e99bf017431e4a~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
      ]
    },
    "images": [
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/737896682be649f6a9e99bf017431e4a~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/737896682be649f6a9e99bf017431e4a~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/1720d6f29a5a4c2da360e9ca84316508~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/1720d6f29a5a4c2da360e9ca84316508~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/35fbc3197a784f7a810f26320094de25~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/35fbc3197a784f7a810f26320094de25~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/c67b706314a94f6c8f3bc77c52ca52b9~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/c67b706314a94f6c8f3bc77c52ca52b9~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/7ce041afa8244d3bb720d84d9a055990~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/7ce041afa8244d3bb720d84d9a055990~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/e9e980d81a144f708d2ce5b0fc149367~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/e9e980d81a144f708d2ce5b0fc149367~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/2dfb919b817c45128909dbb849b36599~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/2dfb919b817c45128909dbb849b36599~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/1b708efa35ca463b81f1c2a5f5a2c741~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/1b708efa35ca463b81f1c2a5f5a2c741~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/96b4848e793d4efcb79adc2069880429~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/96b4848e793d4efcb79adc2069880429~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      }
    ]
  },
  {
    "product_id": "1731300704104646012",
    "title": "Short Feminino Linho Bolso Lapena Fake Com Forro Leve e Sofisticado em Viscolinho Conforto e Estilo  -S870",
    "format_available_price": "R$ 49,99",
    "seller_info": {
      "seller_id": "7496147605739112828",
      "shop_name": "emilimodaa"
    },
    "stock_num": 10863,
    "can_added": true,
    "labels": [
      {
        "text": "50% off",
        "theme": 0,
        "type": 25
      },
      {
        "theme": 0,
        "type": 34
      }
    ],
    "category_info": {
      "name": "Womenswear & Underwear"
    },
    "affiliate_info": {
      "est_commission_expense": "R$ 5,00",
      "commission_with_currency": "R$ 5,00",
      "commission_rate": 1000,
      "commission_expense": 5,
      "commission_view_type": 0
    },
    "cover": {
      "url_list": [
        "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/40b03f42688f4c12a045a863472439c0~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
        "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/40b03f42688f4c12a045a863472439c0~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
      ]
    },
    "images": [
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/40b03f42688f4c12a045a863472439c0~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/40b03f42688f4c12a045a863472439c0~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/adf12d8ecc9a46b091d6c1e96c568f76~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/adf12d8ecc9a46b091d6c1e96c568f76~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/b79de1c99cbf48bcae61e47df406f5e9~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/b79de1c99cbf48bcae61e47df406f5e9~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/e818770164df408fa7bda1b963c8b8bb~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/e818770164df408fa7bda1b963c8b8bb~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/33893fc4bf8b4ec7890dfbd01d2455eb~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/33893fc4bf8b4ec7890dfbd01d2455eb~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/356d8c4e17c641dfa0fc6031dec69bfc~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/356d8c4e17c641dfa0fc6031dec69bfc~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/03ccea0002a547d98aee3fbf125b74b3~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/03ccea0002a547d98aee3fbf125b74b3~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/46c4576aa7a94e25ab4df4a49e475148~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/46c4576aa7a94e25ab4df4a49e475148~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/8f5a1821f0af420685b2a0fffdddd57f~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/8f5a1821f0af420685b2a0fffdddd57f~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      }
    ]
  },
  {
    "product_id": "1733102609961944555",
    "title": "ARARA SPORT KIT 2 Calça Legging Canelada Poliamida Sem Costura Sem Empina Cintura Alta Zero Transparente Para Academia Dia A Dia",
    "format_available_price": "R$ 89,90",
    "seller_info": {
      "seller_id": "7496205123342666219",
      "shop_name": "ararasport_oficial"
    },
    "stock_num": 16862,
    "can_added": true,
    "labels": [
      {
        "text": "70% off",
        "theme": 0,
        "type": 25
      },
      {
        "theme": 0,
        "type": 34
      }
    ],
    "category_info": {
      "name": "Sports & Outdoor"
    },
    "affiliate_info": {
      "est_commission_expense": "R$ 8,99",
      "commission_with_currency": "R$ 8,99",
      "commission_rate": 1000,
      "commission_expense": 8.99,
      "commission_view_type": 0
    },
    "cover": {
      "url_list": [
        "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/6ef93aeab82d4358bd23b1d718a2158a~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
        "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/6ef93aeab82d4358bd23b1d718a2158a~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
      ]
    },
    "images": [
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/6ef93aeab82d4358bd23b1d718a2158a~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/6ef93aeab82d4358bd23b1d718a2158a~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/cc023515ff7143768b73dec9165bcfc4~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/cc023515ff7143768b73dec9165bcfc4~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/f3b98aa7daed4e32863a6146ff30237a~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/f3b98aa7daed4e32863a6146ff30237a~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/8178ec32a95d490aae16ce518e8c9fda~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/8178ec32a95d490aae16ce518e8c9fda~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/66ff36efc882492dbc21a4298b3c3d57~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/66ff36efc882492dbc21a4298b3c3d57~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/3f774b3830f9496cb078ed43e03d956b~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/3f774b3830f9496cb078ed43e03d956b~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/677baca75c134e4fbf0f77b5aace42d9~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/677baca75c134e4fbf0f77b5aace42d9~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/407a691c3dd24b518ab7e92016b48bfb~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/407a691c3dd24b518ab7e92016b48bfb~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      },
      {
        "url_list": [
          "https://p16-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/e8990d3a55c745c3b0e4b588751f5da0~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687",
          "https://p19-oec-sg.ibyteimg.com/tos-alisg-i-aphluv4xwc-sg/e8990d3a55c745c3b0e4b588751f5da0~tplv-aphluv4xwc-resize-jpeg:300:300.jpeg?dr=15584&t=555f072d&ps=933b5bde&shp=5aca9457&shcp=9b759fb9&idc=my&from=1523225687"
        ]
      }
    ]
  }
];

/** Fonte estável da Vitrine para a camada de UI: o fixture passa pelo mesmo
 *  normalizador allowlist. Sem rede, sessão, persistência ou quota. */
export function listShowcaseItems(): ShowcaseItem[] {
  return SHOWCASE_FIXTURES.map(toShowcaseItem).filter(
    (item): item is ShowcaseItem => item !== null,
  );
}
