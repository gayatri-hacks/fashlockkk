import { ProductsTable } from "@/components/products-table";
import { SectionHeader } from "@/components/section-header";
import { loadFilters, loadProductsData } from "@/lib/data";

export default async function ProductsPage() {
  const [products, filters] = await Promise.all([loadProductsData({ search: "", source: "", brand: "", category: "", color: "" }), loadFilters()]);

  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Catalog"
        title="Products"
        description="Search and filter scraped product records across sources, brands, categories, colors, prices, and scrape dates."
      />

      <ProductsTable data={products} filters={filters} />
    </div>
  );
}
