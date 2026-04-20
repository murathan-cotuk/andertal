"use client";

import dynamic from "next/dynamic";
import { CustomerAuthProvider } from "@belucha/lib";
import { CartProvider } from "@/context/CartContext";
import { WishlistProvider } from "@/context/WishlistContext";
import { LandingChromeProvider } from "@/context/LandingChromeContext";
import { ShopStylesProvider } from "@/context/ShopStylesContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useLenis } from "@/hooks/useLenis";
import PostHogProvider from "@/components/PostHogProvider";

// Lazy-loaded: not needed for initial paint — deferred to after hydration.
const CartSidebar      = dynamic(() => import("@/components/CartSidebar"),      { ssr: false });
const ScrollToTopButton = dynamic(() => import("@/components/ScrollToTopButton"), { ssr: false });
const CookieBanner     = dynamic(() => import("@/components/CookieBanner"),     { ssr: false });

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


