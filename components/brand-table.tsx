import type { ReactNode } from "react";
import { formatCurrency } from "@/lib/utils";
import type { BrandRow } from "@/lib/types";

export function BrandTable({ brands }: { brands: BrandRow[] }) {
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-soft">
      <table className="min-w-full border-separate border-spacing-0">
        <thead className="bg-[#f9f5ef]">
          <tr>
            <Th>Brand</Th>
            <Th>Products</Th>
            <Th>Average Price</Th>
            <Th>Average Discount</Th>
            <Th>Top Categories</Th>
          </tr>
        </thead>
        <tbody>
          {brands.map((brand) => (
            <tr key={brand.brand} className="align-top hover:bg-bg">
              <Td>{brand.brand}</Td>
              <Td>{brand.productCount}</Td>
              <Td>{formatCurrency(brand.averagePrice)}</Td>
              <Td>{brand.averageDiscount.toFixed(1)}%</Td>
              <Td>
                <div className="flex flex-wrap gap-2">
                  {brand.topCategories.map((category) => (
                    <span
                      key={category.category}
                      className="rounded-full border border-border bg-bg px-3 py-1 text-xs font-medium text-text"
                    >
                      {category.category} · {category.count}
                    </span>
                  ))}
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="border-b border-border px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-muted">
      {children}
    </th>
  );
}

function Td({ children }: { children: ReactNode }) {
  return <td className="border-b border-border px-4 py-4 text-sm text-text">{children}</td>;
}
