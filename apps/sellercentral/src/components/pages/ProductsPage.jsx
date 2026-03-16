"use client";

import React, { useState, useEffect, useRef } from "react";
import styled from "styled-components";
import { Card, Button, Input } from "@belucha/ui";
import { getMedusaAdminClient } from "@/lib/medusa-admin-client";

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
`;

const Title = styled.h1`
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 32px;
  color: #1f2937;
`;

const Section = styled(Card)`
  padding: 24px;
  margin-bottom: 24px;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const FormRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const Label = styled.label`
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
`;

const Select = styled.select`
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 16px;
  color: #1f2937;
  background: white;
  transition: all 0.2s ease;
  box-sizing: border-box;

  &:focus {
    outline: none;
    border-color: #0ea5e9;
    box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1);
  }
`;

const CategoryDropdown = styled.div`
  position: relative;
  width: 100%;
`;

const CategoryButton = styled.button`
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 16px;
  color: #1f2937;
  background: white;
  transition: all 0.2s ease;
  box-sizing: border-box;
  text-align: left;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: #0ea5e9;
    box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1);
  }

  &:hover {
    border-color: #0ea5e9;
  }
`;

const CategoryDropdownMenu = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  max-height: 400px;
  overflow-y: auto;
  z-index: 1000;
`;

const CategoryGroup = styled.div`
  padding: 8px 0;
`;

const CategoryGroupTitle = styled.div`
  padding: 8px 16px;
  font-weight: 600;
  font-size: 14px;
  color: #374151;
  background-color: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
`;

const CategoryOption = styled.label`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  cursor: pointer;
  transition: background-color 0.2s ease;

  &:hover {
    background-color: #f3f4f6;
  }

  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
    accent-color: #0ea5e9;
  }

  span {
    font-size: 14px;
    color: #1f2937;
  }
`;

const SelectedCategories = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
`;

const SelectedCategoryTag = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background-color: #f0f9ff;
  border: 1px solid #0ea5e9;
  border-radius: 16px;
  font-size: 12px;
  color: #0ea5e9;
  font-weight: 500;
`;

const CategoryCloseButton = styled.button`
  background: none;
  border: none;
  color: #0ea5e9;
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  font-size: 14px;

  &:hover {
    color: #0284c7;
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 16px;
  color: #1f2937;
  background: white;
  transition: all 0.2s ease;
  box-sizing: border-box;
  min-height: 120px;
  font-family: inherit;
  resize: vertical;

  &:focus {
    outline: none;
    border-color: #0ea5e9;
    box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.1);
  }
`;

const VariantSection = styled.div`
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  margin-top: 8px;
`;

const VariantHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
`;

const VariantOption = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
  padding: 8px;
  background-color: #f9fafb;
  border-radius: 6px;
`;

const SuccessMessage = styled.div`
  background-color: #d1fae5;
  border: 1px solid #10b981;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  color: #065f46;
`;

const ErrorMessage = styled.div`
  background-color: #fee2e2;
  border: 1px solid #ef4444;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
  color: #991b1b;
`;

const ProductsList = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  margin-top: 24px;
`;

const ProductCard = styled(Card)`
  padding: 16px;
`;

const ProductTitle = styled.h3`
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #1f2937;
`;

const ProductInfo = styled.p`
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 4px;
`;

const ProductStatus = styled.span`
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  background-color: ${({ status }) => {
    if (status === "published") return "#d1fae5";
    if (status === "draft") return "#fef3c7";
    return "#fee2e2";
  }};
  color: ${({ status }) => {
    if (status === "published") return "#065f46";
    if (status === "draft") return "#92400e";
    return "#991b1b";
  }};
`;

// Common variant types
const VARIANT_TYPES = [
  { name: "Color", commonOptions: ["Black", "White", "Red", "Blue", "Green", "Yellow", "Pink", "Purple", "Orange", "Gray", "Brown", "Silver", "Gold"] },
  { name: "Size", commonOptions: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] },
  { name: "Material", commonOptions: ["Cotton", "Polyester", "Leather", "Metal", "Plastic", "Wood", "Glass", "Ceramic", "Silk", "Wool"] },
  { name: "Pattern", commonOptions: ["Solid", "Striped", "Polka Dot", "Floral", "Geometric", "Abstract", "Plaid", "Checkered"] },
  { name: "Style", commonOptions: ["Classic", "Modern", "Vintage", "Contemporary", "Minimalist", "Bohemian", "Industrial"] },
  { name: "Finish", commonOptions: ["Matte", "Glossy", "Satin", "Brushed", "Polished", "Textured"] },
  { name: "Capacity", commonOptions: ["16GB", "32GB", "64GB", "128GB", "256GB", "512GB", "1TB"] },
  { name: "Weight", commonOptions: ["Light", "Medium", "Heavy"] },
  { name: "Length", commonOptions: ["Short", "Medium", "Long", "Extra Long"] },
  { name: "Width", commonOptions: ["Narrow", "Medium", "Wide"] },
  { name: "Fit", commonOptions: ["Slim", "Regular", "Relaxed", "Loose"] },
  { name: "Sleeve Length", commonOptions: ["Sleeveless", "Short Sleeve", "Long Sleeve", "3/4 Sleeve"] },
  { name: "Neck Type", commonOptions: ["Round Neck", "V-Neck", "Collar", "Hood", "Turtleneck"] },
  { name: "Waist Type", commonOptions: ["Low Rise", "Mid Rise", "High Rise"] },
  { name: "Leg Style", commonOptions: ["Straight", "Slim", "Wide", "Skinny", "Bootcut", "Flared"] },
];

export default function ProductsPage() {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    SKU: "",
    description: "",
    price: "",
    inventory: "",
    status: "draft",
    seller: "",
    categories: [],
    variants: [],
  });
  const [message, setMessage] = useState({ type: "", text: "" });

  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [categoriesError, setCategoriesError] = useState(null);
  const [creating, setCreating] = useState(false);
  const medusaClient = getMedusaAdminClient();

  // Fetch products
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setProductsLoading(true);
        const data = await medusaClient.getAdminHubProducts();
        const list = (data.products || []).filter((p) => (p.status || "").toLowerCase() !== "draft");
        setProducts(list);
      } catch (error) {
        console.error('Error fetching products:', error);
        setProducts([]);
      } finally {
        setProductsLoading(false);
      }
    };
    fetchProducts();
  }, []);

  // Fetch categories
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setCategoriesLoading(true);
        const data = await medusaClient.getCategories();
        setCategories(data.product_categories || []);
      } catch (error) {
        console.error('Error fetching categories:', error);
        setCategoriesError(error);
        setCategories([]);
      } finally {
        setCategoriesLoading(false);
      }
    };
    fetchCategories();
  }, []);

  // Debug: Log categories data
  useEffect(() => {
    if (categoriesData) {
      console.log('Categories loaded:', categories.length, categories);
    }
    if (categoriesError) {
      console.error('Categories error:', categoriesError);
    }
  }, [categoriesData, categoriesError, categories.length]);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef(null);

  // Group categories by parent
  const groupedCategories = categories.reduce((acc, cat) => {
    const parentName = cat.parent?.name || "Main Categories";
    if (!acc[parentName]) acc[parentName] = [];
    acc[parentName].push(cat);
    return acc;
  }, {});

  // Close category dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target)) {
        setCategoryDropdownOpen(false);
      }
    };

    if (categoryDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [categoryDropdownOpen]);

  const toggleCategory = (categoryId) => {
    const isSelected = formData.categories.includes(categoryId);
    if (isSelected) {
      setFormData({
        ...formData,
        categories: formData.categories.filter((id) => id !== categoryId),
      });
    } else {
      setFormData({
        ...formData,
        categories: [...formData.categories, categoryId],
      });
    }
  };

  const removeCategory = (categoryId) => {
    setFormData({
      ...formData,
      categories: formData.categories.filter((id) => id !== categoryId),
    });
  };

  const getCategoryName = (categoryId) => {
    const category = categories.find((cat) => cat.id === categoryId);
    return category?.name || "";
  };

  const addVariant = () => {
    setFormData({
      ...formData,
      variants: [
        ...formData.variants,
        {
          name: "",
          options: [{ value: "", sku: "", price: "", inventory: 0 }],
        },
      ],
    });
  };

  const removeVariant = (index) => {
    setFormData({
      ...formData,
      variants: formData.variants.filter((_, i) => i !== index),
    });
  };

  const updateVariant = (index, field, value) => {
    const newVariants = [...formData.variants];
    newVariants[index] = { ...newVariants[index], [field]: value };
    setFormData({ ...formData, variants: newVariants });
  };

  const addVariantOption = (variantIndex) => {
    const newVariants = [...formData.variants];
    newVariants[variantIndex].options.push({ value: "", sku: "", price: "", inventory: 0 });
    setFormData({ ...formData, variants: newVariants });
  };

  const removeVariantOption = (variantIndex, optionIndex) => {
    const newVariants = [...formData.variants];
    newVariants[variantIndex].options = newVariants[variantIndex].options.filter((_, i) => i !== optionIndex);
    setFormData({ ...formData, variants: newVariants });
  };

  const updateVariantOption = (variantIndex, optionIndex, field, value) => {
    const newVariants = [...formData.variants];
    newVariants[variantIndex].options[optionIndex] = {
      ...newVariants[variantIndex].options[optionIndex],
      [field]: value,
    };
    setFormData({ ...formData, variants: newVariants });
  };

  const useCommonVariantOptions = (variantIndex, variantType) => {
    const variantTypeData = VARIANT_TYPES.find((v) => v.name === variantType.name);
    if (variantTypeData) {
      updateVariant(variantIndex, "name", variantTypeData.name);
      updateVariant(
        variantIndex,
        "options",
        variantTypeData.commonOptions.map((opt) => ({ value: opt, sku: "", price: "", inventory: 0 }))
      );
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: "", text: "" });

    try {
      const SKU = formData.SKU || formData.title.toUpperCase().replace(/\s+/g, "-").replace(/[^A-Z0-9-]/g, "");
      const slug = SKU.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

      let sellerId = formData.seller;
      if (!sellerId) {
        sellerId = localStorage.getItem("sellerId");
      }
      if (!sellerId && sellersData?.Sellers?.docs?.length > 0) {
        sellerId = sellersData.Sellers.docs[0].id;
      }

      if (!sellerId) {
        setMessage({
          type: "error",
          text: "Unable to determine seller account. Please log out and log in again.",
        });
        return;
      }

      // Filter out empty variants and options
      const validVariants = formData.variants
        .filter((v) => v.name && v.options && v.options.length > 0)
        .map((v) => ({
          name: v.name,
          options: v.options.filter((opt) => opt.value).map((opt) => ({
            value: opt.value,
            sku: opt.sku || "",
            price: opt.price ? parseFloat(opt.price) : undefined,
            inventory: opt.inventory ? parseInt(opt.inventory) : 0,
          })),
        }));

      const productData = {
        title: formData.title,
        slug: slug,
        sku: SKU,
        description: formData.description || "",
        price: parseFloat(formData.price),
        inventory: parseInt(formData.inventory) || 0,
        status: formData.status,
        seller: sellerId,
        category: formData.categories.length > 0 ? formData.categories : undefined,
        variants: validVariants.length > 0 ? validVariants : undefined,
      };

      setCreating(true);
      const result = await medusaClient.createAdminHubProduct(productData);
      
      // Refresh products list
      const data = await medusaClient.getAdminHubProducts();
      const list = (data.products || []).filter((p) => (p.status || "").toLowerCase() !== "draft");
      setProducts(list);

      setMessage({ type: "success", text: "Product created successfully!" });
      setFormData({
        title: "",
        SKU: "",
        description: "",
        price: "",
        inventory: "",
        status: "draft",
        seller: sellerId,
        categories: [],
        variants: [],
      });
      setShowForm(false);
      setCreating(false);
    } catch (error) {
      console.error("Error creating product:", error);
      setMessage({
        type: "error",
        text: error.message || "An error occurred while creating the product",
      });
    }
  };

  // Sellers - şimdilik boş (sellercentral'da seller yönetimi yok)
  const sellers = [];

  return (
    <Container>
      <Title>Products</Title>

      {message.text && (
        <>
          {message.type === "success" ? (
            <SuccessMessage>{message.text}</SuccessMessage>
          ) : (
            <ErrorMessage>{message.text}</ErrorMessage>
          )}
        </>
      )}

      <Section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937" }}>Manage your products</h2>
          <Button onClick={() => setShowForm(!showForm)}>
            {showForm ? "Cancel" : "Add New Product"}
          </Button>
        </div>

        {showForm && (
          <Form onSubmit={handleSubmit}>
            <Input
              label="Product Title *"
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />

            <Input
              label="SKU (auto-generated if empty)"
              type="text"
              value={formData.SKU}
              onChange={(e) => setFormData({ ...formData, SKU: e.target.value })}
              placeholder="PRODUCT-SKU-001"
            />

            <div>
              <Label>Description</Label>
              <TextArea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Product description..."
              />
            </div>

            <div>
              <Label>Categories *</Label>
              <CategoryDropdown ref={categoryDropdownRef}>
                <CategoryButton
                  type="button"
                  onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
                >
                  <span>
                    {formData.categories.length > 0
                      ? `${formData.categories.length} category selected`
                      : "Select categories"}
                  </span>
                  <i
                    className={`fas fa-chevron-${categoryDropdownOpen ? "up" : "down"}`}
                    style={{ fontSize: "12px", color: "#6b7280" }}
                  />
                </CategoryButton>
                {categoryDropdownOpen && (
                  <CategoryDropdownMenu>
                    {categoriesLoading ? (
                      <div style={{ padding: "16px", textAlign: "center", color: "#6b7280" }}>
                        <i className="fas fa-spinner fa-spin" style={{ marginRight: "8px" }} />
                        Loading categories...
                      </div>
                    ) : categoriesError ? (
                      <div style={{ padding: "16px", textAlign: "center", color: "#ef4444" }}>
                        <i className="fas fa-exclamation-triangle" style={{ marginRight: "8px" }} />
                        Error loading categories: {categoriesError.message}
                        <br />
                        <small style={{ marginTop: "8px", display: "block", fontSize: "12px" }}>
                          Veriler Medusa backend'den yükleniyor
                        </small>
                      </div>
                    ) : categories.length === 0 ? (
                      <div style={{ padding: "16px", textAlign: "center", color: "#6b7280" }}>
                        <i className="fas fa-info-circle" style={{ marginRight: "8px" }} />
                        No categories found. Seed categories via Medusa admin or run Medusa migrations.
                      </div>
                    ) : Object.keys(groupedCategories).length === 0 ? (
                      <div style={{ padding: "16px", textAlign: "center", color: "#6b7280" }}>
                        <i className="fas fa-info-circle" style={{ marginRight: "8px" }} />
                        No categories to display
                      </div>
                    ) : (
                      Object.entries(groupedCategories).map(([parentName, cats]) => (
                        <CategoryGroup key={parentName}>
                          <CategoryGroupTitle>{parentName}</CategoryGroupTitle>
                          {cats.map((cat) => (
                            <CategoryOption key={cat.id}>
                              <input
                                type="checkbox"
                                checked={formData.categories.includes(cat.id)}
                                onChange={() => toggleCategory(cat.id)}
                              />
                              <span>{cat.name}</span>
                            </CategoryOption>
                          ))}
                        </CategoryGroup>
                      ))
                    )}
                  </CategoryDropdownMenu>
                )}
              </CategoryDropdown>
              {formData.categories.length > 0 && (
                <SelectedCategories>
                  {formData.categories.map((catId) => (
                    <SelectedCategoryTag key={catId}>
                      {getCategoryName(catId)}
                      <CategoryCloseButton
                        type="button"
                        onClick={() => removeCategory(catId)}
                        title="Remove category"
                      >
                        <i className="fas fa-times" />
                      </CategoryCloseButton>
                    </SelectedCategoryTag>
                  ))}
                </SelectedCategories>
              )}
            </div>

            <FormRow>
              <Input
                label="Price (€) *"
                type="number"
                step="0.01"
                min="0"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                required
              />

              <Input
                label="Inventory *"
                type="number"
                min="0"
                value={formData.inventory}
                onChange={(e) => setFormData({ ...formData, inventory: e.target.value })}
                required
              />
            </FormRow>

            <FormRow>
              <div>
                <Label>Status *</Label>
                <Select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  required
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </Select>
              </div>

              {sellers.length > 0 && (
                <div>
                  <Label>Seller</Label>
                  <Select
                    value={formData.seller || sellers[0]?.id || ""}
                    onChange={(e) => setFormData({ ...formData, seller: e.target.value })}
                  >
                    {sellers.map((seller) => (
                      <option key={seller.id} value={seller.id}>
                        {seller.storeName}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </FormRow>

            {/* Product Variants Section */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <Label>Product Variants (Color, Size, Material, etc.)</Label>
                <Button type="button" onClick={addVariant} style={{ padding: "8px 16px", fontSize: "14px" }}>
                  <i className="fas fa-plus" style={{ marginRight: "4px" }} />
                  Add Variant
                </Button>
              </div>

              {formData.variants.map((variant, variantIndex) => (
                <VariantSection key={variantIndex}>
                  <VariantHeader>
                    <div style={{ flex: 1, display: "flex", gap: "8px", alignItems: "center" }}>
                      <Input
                        type="text"
                        placeholder="Variant name (e.g., Color, Size)"
                        value={variant.name}
                        onChange={(e) => updateVariant(variantIndex, "name", e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <Select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            useCommonVariantOptions(variantIndex, VARIANT_TYPES.find((v) => v.name === e.target.value));
                          }
                        }}
                        style={{ width: "200px" }}
                      >
                        <option value="">Use common options...</option>
                        {VARIANT_TYPES.map((vt) => (
                          <option key={vt.name} value={vt.name}>
                            {vt.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <Button
                      type="button"
                      onClick={() => removeVariant(variantIndex)}
                      style={{ padding: "8px 12px", backgroundColor: "#ef4444", color: "white" }}
                    >
                      <i className="fas fa-trash" />
                    </Button>
                  </VariantHeader>

                  {variant.options.map((option, optionIndex) => (
                    <VariantOption key={optionIndex}>
                      <Input
                        type="text"
                        placeholder="Option value"
                        value={option.value}
                        onChange={(e) => updateVariantOption(variantIndex, optionIndex, "value", e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <Input
                        type="text"
                        placeholder="SKU"
                        value={option.sku}
                        onChange={(e) => updateVariantOption(variantIndex, optionIndex, "sku", e.target.value)}
                        style={{ width: "120px" }}
                      />
                      <Input
                        type="number"
                        placeholder="Price"
                        step="0.01"
                        value={option.price}
                        onChange={(e) => updateVariantOption(variantIndex, optionIndex, "price", e.target.value)}
                        style={{ width: "100px" }}
                      />
                      <Input
                        type="number"
                        placeholder="Inventory"
                        value={option.inventory}
                        onChange={(e) => updateVariantOption(variantIndex, optionIndex, "inventory", parseInt(e.target.value) || 0)}
                        style={{ width: "100px" }}
                      />
                      <Button
                        type="button"
                        onClick={() => removeVariantOption(variantIndex, optionIndex)}
                        style={{ padding: "8px 12px", backgroundColor: "#ef4444", color: "white" }}
                      >
                        <i className="fas fa-times" />
                      </Button>
                    </VariantOption>
                  ))}

                  <Button
                    type="button"
                    onClick={() => addVariantOption(variantIndex)}
                    style={{ marginTop: "8px", padding: "6px 12px", fontSize: "12px" }}
                  >
                    <i className="fas fa-plus" style={{ marginRight: "4px" }} />
                    Add Option
                  </Button>
                </VariantSection>
              ))}
            </div>

            <Button type="submit" fullWidth disabled={creating}>
              {creating ? "Creating..." : "Create Product"}
            </Button>
          </Form>
        )}

        <p style={{ marginTop: "16px", color: "#6b7280" }}>
          Total products: {products.length}
        </p>
      </Section>

      {products.length > 0 && (
        <Section>
          <h2 style={{ fontSize: "20px", fontWeight: "600", color: "#1f2937", marginBottom: "16px" }}>
            Your Products
          </h2>
          <ProductsList>
            {products.map((product) => (
              <ProductCard key={product.id}>
                <ProductTitle>{product.title}</ProductTitle>
                <ProductInfo>Price: €{product.price}</ProductInfo>
                <ProductInfo>Inventory: {product.inventory}</ProductInfo>
                <ProductInfo>
                  Status: <ProductStatus status={product.status}>{product.status}</ProductStatus>
                </ProductInfo>
              </ProductCard>
            ))}
          </ProductsList>
        </Section>
      )}
    </Container>
  );
}
