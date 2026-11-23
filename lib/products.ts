/** Stars (XTR) packs. Bonus rolls skip the free-roll cooldown. Prizes are points only, with no cash value. */
export const PRODUCTS = {
  rolls5: { title: "5 bonus rolls", description: "Roll 5 more times without waiting.", stars: 25, rolls: 5 },
  rolls20: { title: "20 bonus rolls", description: "Roll 20 more times without waiting.", stars: 75, rolls: 20 },
} as const;
export type ProductId = keyof typeof PRODUCTS;
