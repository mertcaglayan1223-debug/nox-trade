// Tweet'ten oluşturulan token taslağı (forma aktarılır)
export type Draft = {
  id: number; // her yeni taslakta değişir, form bunu görünce alanları doldurur
  name: string;
  symbol: string;
  description: string;
  twitter: string;
  image?: File | null;
  presetId?: string;
};
