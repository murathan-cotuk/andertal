"use client";

import styled from "styled-components";
import { Link } from "@/i18n/navigation";
import { resolveImageUrl } from "@/lib/image-url";

const Card = styled.article`
  position: relative;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #e8e8e6;
  border-radius: 12px;
  overflow: hidden;
  min-height: 250px;
`;

const BannerWrap = styled.div`
  width: 100%;
  aspect-ratio: 16 / 7;
  background: #f4f4f2;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`;

const Body = styled.div`
  padding: 14px;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
`;

const BrandLine = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
`;

const Logo = styled.div`
  width: 42px;
  height: 42px;
  border-radius: 999px;
  overflow: hidden;
  border: 1px solid #ececec;
  background: #f6f6f5;
  flex-shrink: 0;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`;

const Name = styled.div`
  font-size: 15px;
  font-weight: 700;
  color: #111827;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const Cta = styled(Link)`
  margin-top: auto;
  align-self: flex-start;
  display: inline-block;
  text-decoration: none;
  background: #111827;
  color: #fff;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
`;

export function BrandCard({ brand, ctaLabel = "Zur Marke" }) {
  const name = (brand?.name || "").trim() || "Brand";
  const handle = (brand?.handle || "").trim();
  if (!handle) return null;

  const banner = brand?.banner_image ? resolveImageUrl(brand.banner_image) : "";
  const logo = brand?.logo_image ? resolveImageUrl(brand.logo_image) : "";

  return (
    <Card>
      <BannerWrap>
        {banner ? <img src={banner} alt={name} /> : null}
      </BannerWrap>
      <Body>
        <BrandLine>
          <Logo>{logo ? <img src={logo} alt={name} /> : null}</Logo>
          <Name title={name}>{name}</Name>
        </BrandLine>
        <Cta href={`/brand/${handle}`}>{ctaLabel} →</Cta>
      </Body>
    </Card>
  );
}

