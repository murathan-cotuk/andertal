"use client";

import { CustomerAuthProvider } from "@belucha/lib";
import { CartProvider } from "@/context/CartContext";
import { WishlistProvider } from "@/context/WishlistContext";
import { LandingChromeProvider } from "@/context/LandingChromeContext";
import { ShopStylesProvider } from "@/context/ShopStylesContext";
import CartSidebar from "@/components/CartSidebar";
import ScrollToTopButton from "@/components/ScrollToTopButton";
import CookieBanner from "@/components/CookieBanner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useLenis } from "@/hooks/useLenis";
import PostHogProvider from "@/components/PostHogProvider";

function LenisInit() {
  useLenis();
  return null;
}

export default function Providers({ children }) {
  return (
    <PostHogProvider>
    <ErrorBoundary>
      <CustomerAuthProvider>
        <WishlistProvider>
          <CartProvider>
            <ShopStylesProvider>
              <LandingChromeProvider>
                <LenisInit />
                {children}
              </LandingChromeProvider>
            </ShopStylesProvider>
            <CartSidebar />
            <ScrollToTopButton />
            <CookieBanner />
          </CartProvider>
        </WishlistProvider>
      </CustomerAuthProvider>
    </ErrorBoundary>
    </PostHogProvider>
  );
}


