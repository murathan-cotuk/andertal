export const generateSEOMeta = ({
  title = "Andertal - Your Marketplace",
  description = "Discover amazing products from independent sellers",
  image = "/og-image.jpg",
  url = "",
  type = "website",
} = {}) => {
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: "Andertal",
      images: [{ url: image }],
      type,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
};

