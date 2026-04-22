import "./globals.css";
import ShopStylesInjector from "@/components/ShopStylesInjector";

export const metadata = {
  title: {
    default: "Belucha - Your Marketplace",
    template: "%s | Belucha",
  },
  description: "Discover amazing products from independent sellers",
  openGraph: {
    title: "Belucha - Your Marketplace",
    description: "Discover amazing products from independent sellers",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <ShopStylesInjector />
        {children}
      </body>
    </html>
  );
}

