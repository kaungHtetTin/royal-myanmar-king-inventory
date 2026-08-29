import axios, { AxiosError } from 'axios';
import type { PaginationMeta } from './administration';

export type WarehouseOption = { id: number; code: string; name: string };
export type ProductUnitOption = {
    id: number;
    name: string;
    conversion_factor: number;
    is_base: boolean;
    is_default_selling: boolean;
};
export type ProductOption = {
    id: number;
    sku: string;
    name: string;
    unit: string;
    selling_price: number;
    base_unit?: Pick<ProductUnitOption, 'id' | 'name' | 'conversion_factor'> | null;
    default_selling_unit?: Pick<ProductUnitOption, 'id' | 'name' | 'conversion_factor'> | null;
    units?: ProductUnitOption[];
};
export type InventoryOptions = {
    warehouses: WarehouseOption[];
    products: ProductOption[];
    movement_types: string[];
};
export type InventoryBalance = {
    id: number;
    product: ProductOption;
    quantity: number;
    updated_at: string | null;
};
export type StockMovement = {
    id: number;
    reference: string;
    movement_type: string;
    product: ProductOption;
    quantity: number;
    source: { type: string; id: number };
    from: { type: string | null; id: number | null };
    to: { type: string | null; id: number | null };
    actor: { id: number; name: string };
    notes: string | null;
    occurred_at: string | null;
};
export type ImportItem = {
    id?: number;
    product: ProductOption;
    quantity: number;
    base_quantity: number;
    product_unit: ProductUnitOption | null;
};
export type StockImport = {
    id: number;
    reference: string;
    warehouse: WarehouseOption;
    status: 'draft' | 'posted' | 'voided';
    notes: string | null;
    items: ImportItem[];
    total_quantity: number;
    created_by: { id: number; name: string };
    posted_by: { id: number; name: string } | null;
    posted_at: string | null;
    voided_by: { id: number; name: string } | null;
    voided_at: string | null;
    void_reason: string | null;
    created_at: string | null;
};
export type StockAdjustment = {
    id: number;
    reference: string;
    warehouse: WarehouseOption;
    product: ProductOption;
    adjustment_type: 'increase' | 'decrease';
    quantity: number;
    reason: string;
    notes: string | null;
    status: 'draft' | 'posted';
    created_by: { id: number; name: string };
    posted_by: { id: number; name: string } | null;
    posted_at: string | null;
    created_at: string | null;
};
export type ImportInput = {
    warehouse_id: number;
    notes: string;
    items: { product_id: number; product_unit_id: number; quantity: number }[];
};
export type AdjustmentInput = {
    warehouse_id: number;
    product_id: number;
    adjustment_type: 'increase' | 'decrease';
    quantity: number;
    reason: string;
    notes: string;
};
export type ListFilters = {
    page?: number;
    warehouse_id?: number;
    product_id?: number;
    status?: string;
    movement_type?: string;
    adjustment_type?: string;
    reference?: string;
    search?: string;
    stock?: string;
    date_from?: string;
    date_to?: string;
};
export type InventorySummary = { products: number; total: number; units: number; warehouses: number };

export class InventoryApiError extends Error {
    constructor(
        message: string,
        public readonly fields: Record<string, string[]> = {},
        public readonly code?: string,
    ) {
        super(message);
    }
}

function apiError(error: unknown) {
    if (!axios.isAxiosError(error)) return new InventoryApiError('Something went wrong. Please try again.');
    const response = (
        error as AxiosError<{
            code?: string;
            errors?: Record<string, string[]>;
            message?: string;
        }>
    ).response;
    return new InventoryApiError(
        response?.data.message ?? 'Unable to complete the request.',
        response?.data.errors ?? {},
        response?.data.code,
    );
}

async function request<T>(operation: () => Promise<{ data: T }>) {
    try {
        return (await operation()).data;
    } catch (error) {
        throw apiError(error);
    }
}

const pageParams = (filters: ListFilters) => ({ ...filters, per_page: 20 });
const commandHeaders = () => ({ 'Idempotency-Key': crypto.randomUUID() });

export const inventoryApi = {
    options: () => request<InventoryOptions>(() => window.axios.get('api/admin/inventory/options')),
    balances: (filters: ListFilters) =>
        request<{ data: InventoryBalance[]; meta: PaginationMeta; summary: InventorySummary }>(() =>
            window.axios.get('api/admin/inventory', {
                params: pageParams(filters),
            }),
        ),
    exportBalances: async (filters: ListFilters) => {
        try {
            const params = { ...filters };
            delete params.page;
            const response = await window.axios.get<Blob>('api/admin/inventory/export', {
                params,
                responseType: 'blob',
            });
            const disposition = String(response.headers['content-disposition'] ?? '');
            const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? 'on-hand-stock.csv';

            return { blob: response.data, filename };
        } catch (error) {
            throw apiError(error);
        }
    },
    movements: (filters: ListFilters) =>
        request<{ data: StockMovement[]; meta: PaginationMeta; summary: InventorySummary }>(() =>
            window.axios.get('api/admin/inventory/movements', {
                params: pageParams(filters),
            }),
        ),
    imports: (filters: ListFilters) =>
        request<{ data: StockImport[]; meta: PaginationMeta; summary: InventorySummary }>(() =>
            window.axios.get('api/admin/stock-imports', {
                params: pageParams(filters),
            }),
        ),
    importRecord: (id: number) =>
        request<{ data: StockImport }>(() => window.axios.get(`api/admin/stock-imports/${id}`)),
    adjustments: (filters: ListFilters) =>
        request<{ data: StockAdjustment[]; meta: PaginationMeta; summary: InventorySummary }>(() =>
            window.axios.get('api/admin/stock-adjustments', {
                params: pageParams(filters),
            }),
        ),
    createImport: (input: ImportInput) =>
        request<{ data: StockImport }>(() => window.axios.post('api/admin/stock-imports', input)),
    updateImport: (id: number, input: ImportInput) =>
        request<{ data: StockImport }>(() => window.axios.put(`api/admin/stock-imports/${id}`, input)),
    postImport: (id: number) =>
        request<{ data: StockImport }>(() =>
            window.axios.post(`api/admin/stock-imports/${id}/post`, {}, { headers: commandHeaders() }),
        ),
    voidImport: (id: number, reason: string) =>
        request<{ data: StockImport }>(() =>
            window.axios.post(`api/admin/stock-imports/${id}/void`, { reason }, { headers: commandHeaders() }),
        ),
    createAdjustment: (input: AdjustmentInput) =>
        request<{ data: StockAdjustment }>(() => window.axios.post('api/admin/stock-adjustments', input)),
    updateAdjustment: (id: number, input: AdjustmentInput) =>
        request<{ data: StockAdjustment }>(() => window.axios.put(`api/admin/stock-adjustments/${id}`, input)),
    postAdjustment: (id: number) =>
        request<{ data: StockAdjustment }>(() =>
            window.axios.post(`api/admin/stock-adjustments/${id}/post`, {}, { headers: commandHeaders() }),
        ),
};
