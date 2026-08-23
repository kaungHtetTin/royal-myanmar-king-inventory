import axios, { AxiosError } from 'axios';
import type { PaginationMeta } from './administration';

export type WarehouseOption = { id: number; code: string; name: string };
export type ProductOption = {
    id: number;
    sku: string;
    name: string;
    unit: string;
    warehouse_stock?: Record<string, number>;
    representative_stock?: Record<string, number>;
};
export type RepresentativeOption = {
    id: number;
    code: string;
    name: string;
    primary_warehouse_id?: number;
};
export type TransferItem = {
    id?: number;
    product: ProductOption;
    quantity: number;
    in_transit_quantity: number;
};
export type TransferActor = { id: number; name: string } | null;
export type TransferStatus = 'draft' | 'dispatched' | 'received' | 'cancelled' | 'reversed';
export type WarehouseTransfer = {
    id: number;
    reference: string;
    source_warehouse: WarehouseOption;
    destination_warehouse: WarehouseOption;
    status: TransferStatus;
    notes: string | null;
    items: TransferItem[];
    total_quantity: number;
    created_by: TransferActor;
    dispatched_by: TransferActor;
    dispatched_at: string | null;
    received_by: TransferActor;
    received_at: string | null;
    cancelled_by: TransferActor;
    cancelled_at: string | null;
    cancel_reason: string | null;
    reversed_by: TransferActor;
    reversed_at: string | null;
    reversal_reason: string | null;
    created_at: string | null;
};
export type RepresentativeTransfer = {
    id: number;
    reference: string;
    direction: 'issue' | 'return';
    source_warehouse: WarehouseOption;
    representative: RepresentativeOption;
    status: TransferStatus;
    notes: string | null;
    items: TransferItem[];
    total_quantity: number;
    created_by: TransferActor;
    dispatched_by: TransferActor;
    dispatched_at: string | null;
    received_by: TransferActor;
    received_at: string | null;
    cancelled_by: TransferActor;
    cancelled_at: string | null;
    cancel_reason: string | null;
    reversed_by: TransferActor;
    reversed_at: string | null;
    reversal_reason: string | null;
    created_at: string | null;
};
export type RepresentativeInventory = {
    id: number;
    representative: RepresentativeOption;
    product: ProductOption;
    quantity: number;
    pending_quantity: number;
    capacity_remaining: number;
    updated_at: string | null;
};
export type WarehouseTransferOptions = {
    source_warehouses: WarehouseOption[];
    destination_warehouses: WarehouseOption[];
    products: ProductOption[];
};
export type RepresentativeTransferOptions = {
    source_warehouses: WarehouseOption[];
    representatives: RepresentativeOption[];
    products: ProductOption[];
};
export type WarehouseTransferInput = {
    source_warehouse_id: number;
    destination_warehouse_id: number;
    notes: string;
    items: { product_id: number; quantity: number }[];
};
export type RepresentativeTransferInput = {
    source_warehouse_id: number;
    sales_representative_id: number;
    notes: string;
    items: { product_id: number; quantity: number }[];
};
export type RepresentativeReturnInput = {
    target_warehouse_id: number;
    sales_representative_id: number;
    notes: string;
    items: { product_id: number; quantity: number }[];
};
export type TransferFilters = {
    page?: number;
    warehouse_id?: number;
    representative_id?: number;
    product_id?: number;
    status?: string;
    search?: string;
};

export class TransferApiError extends Error {
    constructor(
        message: string,
        public readonly fields: Record<string, string[]> = {},
        public readonly code?: string,
    ) {
        super(message);
    }
}

function apiError(error: unknown) {
    if (!axios.isAxiosError(error)) return new TransferApiError('Something went wrong. Please try again.');
    const response = (
        error as AxiosError<{
            code?: string;
            errors?: Record<string, string[]>;
            message?: string;
        }>
    ).response;
    return new TransferApiError(
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

const headers = () => ({ 'Idempotency-Key': crypto.randomUUID() });
const pages = (filters: TransferFilters) => ({ ...filters, per_page: 20 });
export type TransferSummary = { in_transit: number; products: number; total: number; units: number };

export const transferApi = {
    warehouseOptions: () =>
        request<WarehouseTransferOptions>(() => window.axios.get('api/admin/warehouse-transfer-options')),
    representativeOptions: () =>
        request<RepresentativeTransferOptions>(() => window.axios.get('api/admin/representative-transfer-options')),
    representativeReturnOptions: () =>
        request<RepresentativeTransferOptions>(() => window.axios.get('api/admin/representative-return-options')),
    warehouseTransfers: (filters: TransferFilters) =>
        request<{ data: WarehouseTransfer[]; meta: PaginationMeta; summary: TransferSummary }>(() =>
            window.axios.get('api/admin/warehouse-transfers', {
                params: pages(filters),
            }),
        ),
    warehouseTransfer: (id: number) =>
        request<{ data: WarehouseTransfer }>(() => window.axios.get(`api/admin/warehouse-transfers/${id}`)),
    representativeTransfers: (filters: TransferFilters) =>
        request<{ data: RepresentativeTransfer[]; meta: PaginationMeta; summary: TransferSummary }>(() =>
            window.axios.get('api/admin/representative-transfers', {
                params: pages(filters),
            }),
        ),
    representativeTransfer: (id: number) =>
        request<{ data: RepresentativeTransfer }>(() => window.axios.get(`api/admin/representative-transfers/${id}`)),
    representativeReturns: (filters: TransferFilters) =>
        request<{ data: RepresentativeTransfer[]; meta: PaginationMeta; summary: TransferSummary }>(() =>
            window.axios.get('api/admin/representative-returns', { params: pages(filters) }),
        ),
    representativeReturn: (id: number) =>
        request<{ data: RepresentativeTransfer }>(() => window.axios.get(`api/admin/representative-returns/${id}`)),
    representativeInventory: (filters: TransferFilters) =>
        request<{ data: RepresentativeInventory[]; meta: PaginationMeta; summary: TransferSummary }>(() =>
            window.axios.get('api/admin/representative-inventory', {
                params: pages(filters),
            }),
        ),
    createWarehouseTransfer: (input: WarehouseTransferInput) =>
        request<{ data: WarehouseTransfer }>(() => window.axios.post('api/admin/warehouse-transfers', input)),
    updateWarehouseTransfer: (id: number, input: WarehouseTransferInput) =>
        request<{ data: WarehouseTransfer }>(() => window.axios.put(`api/admin/warehouse-transfers/${id}`, input)),
    warehouseCommand: (id: number, command: 'dispatch' | 'receive', payload = {}) =>
        request<{ data: WarehouseTransfer }>(() =>
            window.axios.post(`api/admin/warehouse-transfers/${id}/${command}`, payload, { headers: headers() }),
        ),
    warehouseReasonCommand: (id: number, command: 'cancel' | 'reverse', reason: string) =>
        request<{ data: WarehouseTransfer }>(() =>
            window.axios.post(`api/admin/warehouse-transfers/${id}/${command}`, { reason }, { headers: headers() }),
        ),
    createRepresentativeTransfer: (input: RepresentativeTransferInput) =>
        request<{ data: RepresentativeTransfer }>(() => window.axios.post('api/admin/representative-transfers', input)),
    updateRepresentativeTransfer: (id: number, input: RepresentativeTransferInput) =>
        request<{ data: RepresentativeTransfer }>(() =>
            window.axios.put(`api/admin/representative-transfers/${id}`, input),
        ),
    representativeCommand: (id: number, command: 'dispatch') =>
        request<{ data: RepresentativeTransfer }>(() =>
            window.axios.post(`api/admin/representative-transfers/${id}/${command}`, {}, { headers: headers() }),
        ),
    representativeReasonCommand: (id: number, command: 'cancel' | 'reverse', reason: string) =>
        request<{ data: RepresentativeTransfer }>(() =>
            window.axios.post(
                `api/admin/representative-transfers/${id}/${command}`,
                { reason },
                { headers: headers() },
            ),
        ),
    createRepresentativeReturn: (input: RepresentativeReturnInput) =>
        request<{ data: RepresentativeTransfer }>(() => window.axios.post('api/admin/representative-returns', input)),
    updateRepresentativeReturn: (id: number, input: RepresentativeReturnInput) =>
        request<{ data: RepresentativeTransfer }>(() =>
            window.axios.put(`api/admin/representative-returns/${id}`, input),
        ),
    representativeReturnCommand: (id: number, command: 'post') =>
        request<{ data: RepresentativeTransfer }>(() =>
            window.axios.post(`api/admin/representative-returns/${id}/${command}`, {}, { headers: headers() }),
        ),
    representativeReturnReasonCommand: (id: number, command: 'cancel' | 'reverse', reason: string) =>
        request<{ data: RepresentativeTransfer }>(() =>
            window.axios.post(`api/admin/representative-returns/${id}/${command}`, { reason }, { headers: headers() }),
        ),
    ownStock: (page = 1) =>
        request<{
            data: RepresentativeInventory[];
            meta: PaginationMeta;
            summary: { incoming: number; on_hand: number };
        }>(() => window.axios.get('api/sales/stock', { params: { page, per_page: 10 } })),
    ownReceivings: (page = 1) =>
        request<{ data: RepresentativeTransfer[]; meta: PaginationMeta }>(() =>
            window.axios.get('api/sales/receivings', { params: { page, per_page: 10 } }),
        ),
    ownReceivingHistory: (page = 1) =>
        request<{ data: RepresentativeTransfer[]; meta: PaginationMeta }>(() =>
            window.axios.get('api/sales/receiving-history', { params: { page, per_page: 10 } }),
        ),
    ownReceiving: (id: number) =>
        request<{ data: RepresentativeTransfer }>(() => window.axios.get(`api/sales/receivings/${id}`)),
    receiveOwn: (id: number) =>
        request<{ data: RepresentativeTransfer }>(() =>
            window.axios.post(`api/sales/receivings/${id}/receive`, {}, { headers: headers() }),
        ),
};
