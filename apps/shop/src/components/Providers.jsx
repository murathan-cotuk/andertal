"use client";

import { CustomerAuthProvider } from "@belucha/lib";
import { CartProvider } from "@/context/CartContext";
import { WishlistProvider } from "@/context/WishlistContext";
import { LandingChromeProvider } from "@/context/LandingChromeContext";
import CartSidebar from "@/components/CartSidebar";
import ScrollToTopButton from "@/components/ScrollToTopButton";
import CookieBanner from "@/components/CookieBanner";

export default function Providers({ children }) {
  return (
    <CustomerAuthProvider>
      <WishlistProvider>
        <CartProvider>
          <LandingChromeProvider>
            {children}
          </LandingChromeProvider>
          <CartSidebar />
          <ScrollToTopButton />
          <CookieBanner />
        </CartProvider>
      </WishlistProvider>
    </CustomerAuthProvider>
  );
}


