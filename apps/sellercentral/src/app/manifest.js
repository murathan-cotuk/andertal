export default function manifest() {
  return {
    name: "Andertal Seller Central",
    short_name: "Seller Central",
    description: "Manage your store on Andertal",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0F766E",
    icons: [
      { src: "/api/brand-favicon?app=sellercentral", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/api/brand-favicon?app=sellercentral", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
