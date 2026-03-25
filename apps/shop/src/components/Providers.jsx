"use client";

import { CustomerAuthProvider } from "@belucha/lib";
import { CartProvider } from "@/context/CartContext";
import { WishlistProvider } from "@/context/WishlistContext";
import CartSidebar from "@/components/CartSidebar";
import ScrollToTopButton from "@/components/ScrollToTopButton";

export default function Providers({ children }) {
  return (
    <CustomerAuthProvider>
      <WishlistProvider>
        <CartProvider>
          {children}
          <CartSidebar />
          <ScrollToTopButton />
        </CartProvider>
      </WishlistProvider>
    </CustomerAuthProvider>
  );
}

