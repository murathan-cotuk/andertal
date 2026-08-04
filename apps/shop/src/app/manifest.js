export default function manifest() {
  return {
    name: "Andertal",
    short_name: "Andertal",
    description: "Discover amazing products from independent sellers",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1b8880",
    icons: [
      { src: "/api/brand-favicon", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/api/brand-favicon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
