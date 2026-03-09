"use client";

import ShopHeader from "@/components/ShopHeader";
import Footer from "@/components/Footer";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { getMedusaClient } from "@/lib/medusa-client";

function sanitizeHtml(html) {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "")
    .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/\s+on\w+\s*=\s*[^\s>]+/gi, "");
}

export default function CmsPageBySlug() {
  const params = useParams();
  const slug = params?.slug != null ? String(params.slug) : undefined;

  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;

    const fetchPage = async () => {
      try {
        setLoading(true);
        setNotFound(false);
        const client = getMedusaClient();
        const data = await client.getPageBySlug(slug);
        setPage(data);
      } catch (err) {
        setPage(null);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    fetchPage();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <ShopHeader />
        <main className="flex-1 container mx-auto px-4 py-12">
          <p className="text-gray-500">Loading…</p>
        </main>
        <Footer />
      </div>
    );
  }

  if (notFound || !page) {
    return (
      <div className="min-h-screen flex flex-col">
        <ShopHeader />
        <main className="flex-1 container mx-auto px-4 py-12">
          <h1 className="text-2xl font-semibold text-gray-800">Page not found</h1>
          <p className="text-gray-500 mt-2">The page you are looking for does not exist or is not published.</p>
        </main>
        <Footer />
      </div>
    );
  }

  const safeBody = sanitizeHtml(page.body || "");

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <SlimBar />
      <main className="flex-1 container mx-auto px-4 py-12 max-w-3xl">
        <h1 className="text-3xl font-semibold text-gray-900 mb-6">{page.title}</h1>
        {safeBody ? (
          <div
            className="prose prose-gray max-w-none"
            dangerouslySetInnerHTML={{ __html: safeBody }}
          />
        ) : (
          <p className="text-gray-500">No content.</p>
        )}
      </main>
      <Footer />
    </div>
  );
}
