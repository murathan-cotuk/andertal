"use client";

import { useEffect, useRef } from "react";
import styled from "styled-components";
import { Link, usePathname } from "@/i18n/navigation";
import { useCustomerAuth as useAuth } from "@andertal/lib";
import { restPathFromPathname } from "@/lib/shop-market";

const ORANGE = "#ff971c";
const DARK = "#1A1A1A";
const BORDER = "#e5e7eb";

const NAV = [
  { label: "Übersicht", href: "/account" },
  { label: "Bestellungen", href: "/orders" },
  { label: "Merkzettel", href: "/merkzettel" },
  { label: "Adressen", href: "/addresses" },
  { label: "Zahlungsmethoden", href: "/payment-methods" },
  { label: "Nachrichten", href: "/nachrichten" },
  { label: "Bewertungen", href: "/reviews" },
  { label: "Bonuspunkte", href: "/bonus" },
];

const Wrap = styled.div`
  display: none;
  @media (max-width: 1023px) {
    display: block;
    margin-bottom: 12px;
  }
`;

const Greeting = styled.div`
  background: linear-gradient(135deg, #136761 0%, #1a8a82 100%);
  border-radius: 14px;
  padding: 18px 16px;
  margin-bottom: 10px;
  @media (max-width: 767px) {
    border-radius: 12px;
    padding: 15px 14px;
  }
`;

const GreetingText = styled.div`
  font-size: 20px;
  font-weight: 800;
  color: #fff;
  @media (max-width: 767px) { font-size: 17px; }
`;

const GreetingMeta = styled.div`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  margin-top: 3px;
`;

const NavScroll = styled.div`
  display: flex;
  flex-direction: row;
  gap: 8px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  padding: 0 0 10px;
  &::-webkit-scrollbar { display: none; }
`;

const NavPill = styled(Link)`
  flex: 0 0 auto;
  scroll-snap-align: start;
  display: inline-flex;
  align-items: center;
  padding: 7px 15px;
  background: ${(p) => (p.$active ? ORANGE : "#fff")};
  color: ${(p) => (p.$active ? "#fff" : DARK)};
  border: 1.5px solid ${(p) => (p.$active ? ORANGE : BORDER)};
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  text-decoration: none;
  transition: all 0.12s;
`;

const NavLogout = styled.button`
  flex: 0 0 auto;
  scroll-snap-align: start;
  display: inline-flex;
  align-items: center;
  padding: 7px 15px;
  background: #fff;
  color: #ef4444;
  border: 1.5px solid #fecaca;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  font-family: inherit;
`;

function normalizePath(pathname) {
  if (!pathname) return "/";
  const rest = restPathFromPathname(pathname);
  return rest === "" ? "/" : rest.startsWith("/") ? rest : `/${rest}`;
}

export default function AccountMobileHeader({ onLogout }) {
  const { user } = useAuth();
  const pathname = usePathname() || "/";
  const appPath = normalizePath(pathname);
  const firstName = user?.firstName || user?.first_name || "";
  const cno = user?.customer_number;
  const numSuffix = cno != null && cno !== "" ? ` #${cno}` : "";
  const greeting = firstName
    ? `Hallo, ${firstName}${numSuffix}!`
    : numSuffix
      ? `Hallo!${numSuffix}`
      : "Hallo!";
  const scrollRef = useRef(null);
  const activeRef = useRef(null);

  useEffect(() => {
    if (!scrollRef.current || !activeRef.current) return;
    const container = scrollRef.current;
    const active = activeRef.current;
    const containerLeft = container.getBoundingClientRect().left;
    const activeLeft = active.getBoundingClientRect().left;
    const offset = activeLeft - containerLeft - (container.clientWidth / 2) + (active.offsetWidth / 2);
    container.scrollBy({ left: offset, behavior: "smooth" });
  }, [appPath]);

  return (
    <Wrap>
      <Greeting>
        <GreetingText>{greeting}</GreetingText>
        {user?.email && <GreetingMeta>{user.email}</GreetingMeta>}
      </Greeting>
      <NavScroll ref={scrollRef}>
        {NAV.map((item) => {
          const active =
            item.href === "/account"
              ? appPath === "/account"
              : appPath === item.href || appPath.startsWith(`${item.href}/`);
          return (
            <NavPill key={item.href} href={item.href} $active={active} ref={active ? activeRef : null}>
              {item.label}
            </NavPill>
          );
        })}
        {onLogout && (
          <NavLogout
            type="button"
            onClick={() => {
              document.cookie = "andertal_cauth=; path=/; max-age=0; SameSite=Lax";
              onLogout();
            }}
          >
            Abmelden
          </NavLogout>
        )}
      </NavScroll>
    </Wrap>
  );
}
