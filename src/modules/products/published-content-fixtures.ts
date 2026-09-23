// Fixtures sanitizadas de conteúdo publicado (Slice 013). Copiado manualmente das notas
// aprovadas post-https-api-tikhub-io-ap (analytics: 10 stats disponíveis de um total
// upstream 21 — pages 2-3 não vieram na resposta capturada) e post-https-api-tikhub-io-ap-2
// (associações item→produto, 2 pares). Só campos allowlisted: sem cookie, envelope,
// cache_url, request_id, post_url assinado, thumbnails não usados ou payload bruto.
// Playback restrito a hosts https *.tiktokcdn.com; money usa amount_formatted (ADR dos
// rulings); valores zero/nulo preservados. gmv/directGmv/itemSoldCnt são MetricField da SPEC: Nomes de origem (snake_case) vivem só aqui —
// projectVideo produz o contrato camelCase compartilhado. teste.json nunca é lido.
import { listShowcaseItems } from "./showcase";
import type { PublishedContentScalar, ShowcaseProduct } from "./published-content-contract";

export type PublishedVideoAnalyticsFixture = {
  item_id: string;
  title?: string;
  cover_url?: string;
  main_url?: string;
  backup_url?: string;
  published_at?: string;
  business: Record<string, PublishedContentScalar>;
  metrics: Record<string, PublishedContentScalar>;
};

export type PublishedVideoAnalyticsPageFixture = {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  items: PublishedVideoAnalyticsFixture[];
};

export type PublishedVideoItemAssociationFixture = {
  item_id: string;
  product_id: string;
};

/** Products da Vitrine já allowlisted (reuso de listShowcaseItems): os mesmos 20 itens,
 *  sem duplicar os dados; comissão normalizada ao amount_formatted escalar. */
export const SHOWCASE_PRODUCT_FIXTURES: ShowcaseProduct[] = listShowcaseItems().map((item) => ({
  externalProductId: item.id,
  title: item.title,
  ...(item.categoryName ? { categoryName: item.categoryName } : {}),
  ...(item.priceLabel ? { priceLabel: item.priceLabel } : {}),
  ...(item.sellerName ? { sellerName: item.sellerName } : {}),
  sellerId: item.sellerId ?? null,
  stockCount: typeof item.stockCount === "number" ? item.stockCount : null,
  canAdd: typeof item.canAdd === "boolean" ? item.canAdd : null,
  ...(item.affiliateInfo
    ? {
        commission: item.affiliateInfo.commissionWithCurrency,
        commissionRate: item.affiliateInfo.commissionRate,
        commissionExpense: item.affiliateInfo.commissionExpense,
      }
    : {}),
  labels: (item.labels ?? []).map((label) => ({ text: label.text ?? null, type: label.type ?? null, theme: label.theme ?? null, iconUrl: null })),
}));

/** Páginas locais coerentes (5 + 5) na ordem original da resposta aprovada. */
export const PUBLISHED_VIDEO_ANALYTICS_PAGES: PublishedVideoAnalyticsPageFixture[] = [
    {
      page: 1,
      pageSize: 5,
      total: 10,
      hasMore: true,
      items: [
      {
        item_id: "7687850025174437128",
        title: "O TikTok me influenciou e, look bonito sem esforço, e eu gostei muito. #vestidoindiano #modaindiana #moda #modafeminina #vestido",
        published_at: "2026-09-21T10:50:00.000Z",
        main_url: "https://v58.tiktokcdn.com/video/tos/alisg/tos-alisg-pve-0037c001/oMwL8DsvEAccQPQEfBuE9RrFlImRgtFQqwBC5f/?a=1180&bti=MzYzNGYxMS86&&bt=1649&ft=GcDrcInz7ThCRdhGXq8Zmo&mime_type=video_mp4&rc=OmgzNWc8M2Q5NmdmZ2VoZEBpamk0M3k5cnFlZDMzODczNEBeXmJfYDJjXjYxXjAxNjI2YSNwL2Y1MmQ0aWxhLS1kMWBzcw%3D%3D&vvpl=1&l=2026092322482637F1F4A3773516099B05&VExpiration=1790261335&VSignature=R39hXDhz497sFXoQOXOSbA&btag=e000b8000&sp_exp=hash_v0",
        backup_url: "https://v16m.tiktokcdn.com/a27b5da3dd82b206025a1e8ddd3e1f33/6ab53857/video/tos/alisg/tos-alisg-pve-0037c001/oMwL8DsvEAccQPQEfBuE9RrFlImRgtFQqwBC5f/?a=1180&bti=MzYzNGYxMS86&&bt=1649&ft=GcDrcInz7ThCRdhGXq8Zmo&mime_type=video_mp4&rc=OmgzNWc8M2Q5NmdmZ2VoZEBpamk0M3k5cnFlZDMzODczNEBeXmJfYDJjXjYxXjAxNjI2YSNwL2Y1MmQ0aWxhLS1kMWBzcw%3D%3D&vvpl=1&l=2026092322482637F1F4A3773516099B05&btag=e000b8000&sp_exp=hash_v0",
        business: {},
        metrics: { gmv: "R$ 0,00", directGmv: "R$ 0,00", itemSoldCnt: 0, newFollowerCnt: 0, vvCnt: 172, ctr: "0.0395", completionRate: "0.0640" },
      },
      {
        item_id: "7687849047557819655",
        title: "Atenção, essa calça parece muito mais cara… #modafeminina #moda #calcapantalona",
        published_at: "2026-09-21T10:45:00.000Z",
        main_url: "https://v16m.tiktokcdn.com/8a307d15c3df54587220caeca824f285/6ab53859/video/tos/alisg/tos-alisg-pve-0037c001/oQAEmIXiVDehu0z9AGCQ2k1YLgPQ4IejiI5ewy/?a=1180&bti=MzYzNGYxMS86&&bt=670&ft=GcDrcInz7ThCRdhGXq8Zmo&mime_type=video_mp4&rc=ZWVpMzUzZzk7ZjVpNjQzOEBpanQ4cXk5cnhlZDMzODczNEA0Y2IwYzAwNTIxXmBeMy9jYSNgMzNjMmRjZ2xhLS1kMWBzcw%3D%3D&vvpl=1&l=2026092322482637F1F4A3773516099B05&btag=e00088000&sp_exp=hash_v0",
        backup_url: "https://v58.tiktokcdn.com/video/tos/alisg/tos-alisg-pve-0037c001/oQAEmIXiVDehu0z9AGCQ2k1YLgPQ4IejiI5ewy/?a=1180&bti=MzYzNGYxMS86&&bt=670&ft=GcDrcInz7ThCRdhGXq8Zmo&mime_type=video_mp4&rc=ZWVpMzUzZzk7ZjVpNjQzOEBpanQ4cXk5cnhlZDMzODczNEA0Y2IwYzAwNTIxXmBeMy9jYSNgMzNjMmRjZ2xhLS1kMWBzcw%3D%3D&vvpl=1&l=2026092322482637F1F4A3773516099B05&VExpiration=1790261337&VSignature=RozF0EN-Mr15uwCzz4tSGA&btag=e00088000&sp_exp=hash_v0",
        business: {},
        metrics: { gmv: "R$ 0,00", directGmv: "R$ 0,00", itemSoldCnt: 0, newFollowerCnt: 1, vvCnt: 99, ctr: "0.0381", completionRate: "0.0606" },
      },
      {
        item_id: "7687847602544561426",
        title: "Essa foi a minha melhor compra e eu recomendo. #moda #modafeminina #calcapantalona",
        published_at: "2026-09-21T10:40:00.000Z",
        main_url: "https://v16m.tiktokcdn.com/4be86650d1d047242884be036809c0a7/6ab53858/video/tos/alisg/tos-alisg-pve-0037c001/o4ATC1FAOJxiCuiIsLEQzQAu9uwfZU2wgWWINB/?a=1180&bti=MzYzNGYxMS86&&bt=690&ft=GcDrcInz7ThCRdhGXq8Zmo&mime_type=video_mp4&rc=NWQ5NTRkNzdnODczOjpkZkBpamVuN3A5cmRlZDMzODczNEBfNWNjXmJeX18xNDQ1XjVjYSNgZnM0MmRjZWxhLS1kMWBzcw%3D%3D&vvpl=1&l=2026092322482637F1F4A3773516099B05&btag=e00088000&sp_exp=hash_v0",
        backup_url: "https://v45.tiktokcdn.com/f70a4c3208280bab181478dc1e7aa8ba/6ab53858/video/tos/alisg/tos-alisg-pve-0037c001/o4ATC1FAOJxiCuiIsLEQzQAu9uwfZU2wgWWINB/?a=1180&bti=MzYzNGYxMS86&&bt=690&ft=GcDrcInz7ThCRdhGXq8Zmo&mime_type=video_mp4&rc=NWQ5NTRkNzdnODczOjpkZkBpamVuN3A5cmRlZDMzODczNEBfNWNjXmJeX18xNDQ1XjVjYSNgZnM0MmRjZWxhLS1kMWBzcw%3D%3D&vvpl=1&l=2026092322482637F1F4A3773516099B05&btag=e0008d000&sp_exp=hash_v0",
        business: {},
        metrics: { gmv: "R$ 0,00", directGmv: "R$ 0,00", itemSoldCnt: 0, newFollowerCnt: 0, vvCnt: 88, ctr: "0.0000", completionRate: "0.0114" },
      },
      {
        item_id: "7687802173412936978",
        title: "Sério, o resultado disso me surpreendeu . #maquiagem #automaquiagem #autoestima",
        published_at: "2026-09-21T10:35:00.000Z",
        main_url: "https://v58.tiktokcdn.com/video/tos/alisg/tos-alisg-pve-0037c001/oUdtAhXff34x1gkCDAMAi6YzjPVAPCbIVRQL8e/?a=1180&bti=MzYzNGYxMS86&&bt=955&ft=GcDrcInz7ThCRdhGXq8Zmo&mime_type=video_mp4&rc=ZTw4OjhpNDg1ZGk1ZzpkOUBpM2Y4eXg5cnA7ZDMzODczNEAtNjRhX15eNmIxM180Nl8vYSMvb2tgMmQ0cmxhLS1kMWBzcw%3D%3D&vvpl=1&l=2026092322482637F1F4A3773516099B05&VExpiration=1790261330&VSignature=Neq2UHV1wvy-D4Vf0354eA&btag=e000b8000&sp_exp=hash_v0",
        backup_url: "https://v45.tiktokcdn.com/9fb93eac02536fa683f434b63b271189/6ab53852/video/tos/alisg/tos-alisg-pve-0037c001/oUdtAhXff34x1gkCDAMAi6YzjPVAPCbIVRQL8e/?a=1180&bti=MzYzNGYxMS86&&bt=955&ft=GcDrcInz7ThCRdhGXq8Zmo&mime_type=video_mp4&rc=ZTw4OjhpNDg1ZGk1ZzpkOUBpM2Y4eXg5cnA7ZDMzODczNEAtNjRhX15eNmIxM180Nl8vYSMvb2tgMmQ0cmxhLS1kMWBzcw%3D%3D&vvpl=1&l=2026092322482637F1F4A3773516099B05&btag=e000bd000&sp_exp=hash_v0",
        business: {},
        metrics: { gmv: "R$ 0,00", directGmv: "R$ 0,00", itemSoldCnt: 0, newFollowerCnt: 0, vvCnt: 105, ctr: "0.0265", completionRate: "0.0571" },
      },
      {
        item_id: "7687801356639358226",
        title: "Eu testei e, o resultado disso me surpreendeu , e fez diferença. #maquiagem #autocuidado #autoestima",
        published_at: "2026-09-21T10:30:00.000Z",
        main_url: "https://v58.tiktokcdn.com/video/tos/alisg/tos-alisg-pve-0037c001/o4Vf02gGQEYAeGFDRHVIhDaCYIrx4hofAA2F9j/?a=1180&bti=MzYzNGYxMS86&&bt=954&ft=GcDrcInz7ThCRdhGXq8Zmo&mime_type=video_mp4&rc=NWU0Ozc8Nzs6MzQzOTlmO0BpamY0cHU5cjo7ZDMzODczNEAzNTEtMjViNTMxLmNgNTJiYSMuLjFhMmRzcWxhLS1kMWBzcw%3D%3D&vvpl=1&l=2026092322482637F1F4A3773516099B05&VExpiration=1790261331&VSignature=gvIu4lkmEc1X22JXBxK8hA&btag=e000b8000&sp_exp=hash_v0",
        backup_url: "https://v16m.tiktokcdn.com/e3ce04f5e9cca5fb34f0669641f3514e/6ab53853/video/tos/alisg/tos-alisg-pve-0037c001/o4Vf02gGQEYAeGFDRHVIhDaCYIrx4hofAA2F9j/?a=1180&bti=MzYzNGYxMS86&&bt=954&ft=GcDrcInz7ThCRdhGXq8Zmo&mime_type=video_mp4&rc=NWU0Ozc8Nzs6MzQzOTlmO0BpamY0cHU5cjo7ZDMzODczNEAzNTEtMjViNTMxLmNgNTJiYSMuLjFhMmRzcWxhLS1kMWBzcw%3D%3D&vvpl=1&l=2026092322482637F1F4A3773516099B05&btag=e000b8000&sp_exp=hash_v0",
        business: {},
        metrics: { gmv: "R$ 0,00", directGmv: "R$ 0,00", itemSoldCnt: 0, newFollowerCnt: 0, vvCnt: 106, ctr: "0.0093", completionRate: "0.0094" },
      }
      ],
    }
,
    {
      page: 2,
      pageSize: 5,
      total: 10,
      hasMore: false,
      items: [
      {
        item_id: "7686315937775111431",
        title: "Quem indica amiga é! 😉 #academia #fitness #modafitness",
        published_at: "2026-09-17T01:51:50.000Z",
        main_url: "https://v16m.tiktokcdn.com/bd96667a9bf3a1e454ad454723a141df/6ab53853/video/tos/alisg/tos-alisg-pve-0037c001/oETfgA1rAWeGAAPzqtiaEeu4REGtwR4HFvAhYf/?a=1180&bti=MzYzNGYxMS86&&bt=1885&ft=GcDrcInz7ThCRdhGXq8Zmo&mime_type=video_mp4&rc=PDpoNDw6Ozw2OjRpM2QzZUBpMzg6M3U5cnNuZDMzODczNEBfXmJhMF4yXl8xM140LWJeYSNyZTFsMmQ0XmlhLS1kMWBzcw%3D%3D&vvpl=1&l=2026092322482637F1F4A3773516099B05&btag=e000b8000&sp_exp=hash_v0",
        backup_url: "https://v58.tiktokcdn.com/video/tos/alisg/tos-alisg-pve-0037c001/oETfgA1rAWeGAAPzqtiaEeu4REGtwR4HFvAhYf/?a=1180&bti=MzYzNGYxMS86&&bt=1885&ft=GcDrcInz7ThCRdhGXq8Zmo&mime_type=video_mp4&rc=PDpoNDw6Ozw2OjRpM2QzZUBpMzg6M3U5cnNuZDMzODczNEBfXmJhMF4yXl8xM140LWJeYSNyZTFsMmQ0XmlhLS1kMWBzcw%3D%3D&vvpl=1&l=2026092322482637F1F4A3773516099B05&VExpiration=1790261331&VSignature=-mMJsui3cAXcUtzPBwGcsA&btag=e000b8000&sp_exp=hash_v0",
        business: {},
        metrics: { gmv: "R$ 0,00", directGmv: "R$ 0,00", itemSoldCnt: 0, newFollowerCnt: 0, vvCnt: 116, ctr: "0.0000", completionRate: "0.0172" },
      },
      {
        item_id: "7685881552953183496",
        title: "Eu ainda não estou acreditando que paguei tão pouco nessas duas leggin 😱 #academia #fitness #modafitness",
        published_at: "2026-09-15T21:46:06.000Z",
        main_url: "https://v58.tiktokcdn.com/video/tos/alisg/tos-alisg-pve-0037c001/oseQIUyeILAZDUgAIjcG4puV30vRkUVpSDjeCM/?a=1180&bti=MzYzNGYxMS86&&bt=2018&ft=GcDrcInz7ThCRdhGXq8Zmo&mime_type=video_mp4&rc=NzQzZjc0Mzw1NDk8OmQ6NkBpandoOW85cjh1ZDMzODczNEAtMS0xYTBjX2AxNDQ0MGBgYSM0XjQwMmQ0bWhhLS1kMWBzcw%3D%3D&vvpl=1&l=2026092322482637F1F4A3773516099B05&VExpiration=1790261342&VSignature=KMN3P5RWIrYcyVKSaWxdAQ&btag=e00088000&sp_exp=hash_v0",
        backup_url: "https://v16m.tiktokcdn.com/5472d77a4a88c3a20d6ef3a17c240b2e/6ab5385e/video/tos/alisg/tos-alisg-pve-0037c001/oseQIUyeILAZDUgAIjcG4puV30vRkUVpSDjeCM/?a=1180&bti=MzYzNGYxMS86&&bt=2018&ft=GcDrcInz7ThCRdhGXq8Zmo&mime_type=video_mp4&rc=NzQzZjc0Mzw1NDk8OmQ6NkBpandoOW85cjh1ZDMzODczNEAtMS0xYTBjX2AxNDQ0MGBgYSM0XjQwMmQ0bWhhLS1kMWBzcw%3D%3D&vvpl=1&l=2026092322482637F1F4A3773516099B05&btag=e00088000&sp_exp=hash_v0",
        business: {},
        metrics: { gmv: "R$ 0,00", directGmv: "R$ 0,00", itemSoldCnt: 0, newFollowerCnt: 0, vvCnt: 148, ctr: "0.0392", completionRate: "0.0541" },
      },
      {
        item_id: "7685776197527014663",
        title: "Sério, quem treina vai entender 😱😍 #academia #fitness #autoestima",
        published_at: "2026-09-15T14:57:05.000Z",
        main_url: "https://v16m.tiktokcdn.com/ed5ff742a4053303ace8d65f2677c0ad/6ab5384f/video/tos/alisg/tos-alisg-pve-0037c001/oEOpRVfcqIcEEmBiXBqFhyyEEdDQJjAN6gf1OG/?a=1180&bti=MzYzNGYxMS86&&bt=1822&ft=GcDrcInz7ThCRdhGXq8Zmo&mime_type=video_mp4&rc=ZTc3Nzs4ZzhlNTdkaGloN0Bpajp0O2s5cmhvZDMzODczNEA1Y2NiNjYwXzUxMS0uLTBjYSNjYW0vMmRrbWhhLS1kMWBzcw%3D%3D&vvpl=1&l=2026092322482637F1F4A3773516099B05&btag=e000b8000&sp_exp=hash_v0",
        backup_url: "https://v58.tiktokcdn.com/video/tos/alisg/tos-alisg-pve-0037c001/oEOpRVfcqIcEEmBiXBqFhyyEEdDQJjAN6gf1OG/?a=1180&bti=MzYzNGYxMS86&&bt=1822&ft=GcDrcInz7ThCRdhGXq8Zmo&mime_type=video_mp4&rc=ZTc3Nzs4ZzhlNTdkaGloN0Bpajp0O2s5cmhvZDMzODczNEA1Y2NiNjYwXzUxMS0uLTBjYSNjYW0vMmRrbWhhLS1kMWBzcw%3D%3D&vvpl=1&l=2026092322482637F1F4A3773516099B05&VExpiration=1790261327&VSignature=cXX_s0y79R3Wvnr6EW-uHA&btag=e000b8000&sp_exp=hash_v0",
        business: {},
        metrics: { gmv: "R$ 0,00", directGmv: "R$ 0,00", itemSoldCnt: 0, newFollowerCnt: 0, vvCnt: 113, ctr: "0.0000", completionRate: "0.0354" },
      },
      {
        item_id: "7685773833734819090",
        title: "#autoestima #autocuidado #maquiagem",
        published_at: "2026-09-15T14:47:55.000Z",
        main_url: "https://v58.tiktokcdn.com/video/tos/alisg/tos-alisg-pve-0037c001/o8ChdmEIQBgqowqfDWFcp0elgrjsdEAoDBVRgu/?a=1180&bti=MzYzNGYxMS86&&bt=683&ft=GcDrcInz7ThCRdhGXq8Zmo&mime_type=video_mp4&rc=aTtpNWhpZDQ1OWdpNTo1aEBpM2hzM3E5cnRvZDMzODczNEA2Y2EtNWAwNmExNTE2LTRgYSNsMmJeMmQ0ZWhhLS1kMWBzcw%3D%3D&vvpl=1&l=2026092322482637F1F4A3773516099B05&VExpiration=1790261322&VSignature=pCrqt0fYiuXGG68QBWUD0g&btag=e000b8000&sp_exp=hash_v0",
        backup_url: "https://v16m.tiktokcdn.com/b852ca8c75198ed2f3d6e1f4a7ae6c34/6ab5384a/video/tos/alisg/tos-alisg-pve-0037c001/o8ChdmEIQBgqowqfDWFcp0elgrjsdEAoDBVRgu/?a=1180&bti=MzYzNGYxMS86&&bt=683&ft=GcDrcInz7ThCRdhGXq8Zmo&mime_type=video_mp4&rc=aTtpNWhpZDQ1OWdpNTo1aEBpM2hzM3E5cnRvZDMzODczNEA2Y2EtNWAwNmExNTE2LTRgYSNsMmJeMmQ0ZWhhLS1kMWBzcw%3D%3D&vvpl=1&l=2026092322482637F1F4A3773516099B05&btag=e000b8000&sp_exp=hash_v0",
        business: {},
        metrics: { gmv: "R$ 0,00", directGmv: "R$ 0,00", itemSoldCnt: 0, newFollowerCnt: 0, vvCnt: 141, ctr: "0.0000", completionRate: "0.0426" },
      },
      {
        item_id: "7685499159243230472",
        title: "O look que deixa sua princesa ainda mais linda 😍 #modainfantil #roupainfantil #maternidade",
        published_at: "2026-09-14T21:02:09.000Z",
        main_url: "https://v45.tiktokcdn.com/3eeefecd95f4c65703fe6322ec491e5b/6ab53849/video/tos/alisg/tos-alisg-pve-0037c001/o4ERdcIoz2q1e7DKBgf4FGAUgDQoOGOHBGqqYE/?a=1180&bti=MzYzNGYxMS86&&bt=2016&ft=GcDrcInz7ThCRdhGXq8Zmo&mime_type=video_mp4&rc=ZDU5ZTc2NzVmZjg2NDs7N0BpM250cHM5cms5ZDMzODczNEBiMmAzMF81X2ExYi0vYF81YSNiXmllMmRzLmhhLS1kMTFzcw%3D%3D&vvpl=1&l=2026092322482637F1F4A3773516099B05&btag=e000b5000&sp_exp=hash_v0",
        backup_url: "https://v16m.tiktokcdn.com/eafcdea2563a0113e8938a23cc842126/6ab53849/video/tos/alisg/tos-alisg-pve-0037c001/o4ERdcIoz2q1e7DKBgf4FGAUgDQoOGOHBGqqYE/?a=1180&bti=MzYzNGYxMS86&&bt=2016&ft=GcDrcInz7ThCRdhGXq8Zmo&mime_type=video_mp4&rc=ZDU5ZTc2NzVmZjg2NDs7N0BpM250cHM5cms5ZDMzODczNEBiMmAzMF81X2ExYi0vYF81YSNiXmllMmRzLmhhLS1kMTFzcw%3D%3D&vvpl=1&l=2026092322482637F1F4A3773516099B05&btag=e000b0000&sp_exp=hash_v0",
        business: {},
        metrics: { gmv: "R$ 0,00", directGmv: "R$ 0,00", itemSoldCnt: 0, newFollowerCnt: 0, vvCnt: 51, ctr: "0.0000", completionRate: "0.0784" },
      }
      ],
    }
,
];

/** Pares item→produto da nota de associação; ambos os product_id existem na Vitrine. */
export const PUBLISHED_VIDEO_ITEM_ASSOCIATIONS: PublishedVideoItemAssociationFixture[] = [
  { item_id: "7685499159243230472", product_id: "1736673359055521380" },
  { item_id: "7685773833734819090", product_id: "1733261213619029438" }
,
];
