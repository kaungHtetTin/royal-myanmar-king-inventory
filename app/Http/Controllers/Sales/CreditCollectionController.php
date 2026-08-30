<?php

namespace App\Http\Controllers\Sales;

use App\Enums\CustomerPaymentStatus;
use App\Enums\TripStatus;
use App\Exceptions\DomainConflictException;
use App\Http\Controllers\Concerns\HandlesTransferCommands;
use App\Http\Controllers\Controller;
use App\Http\Resources\CustomerPaymentResource;
use App\Models\Customer;
use App\Models\CustomerPayment;
use App\Models\SalesRepresentative;
use App\Models\Trip;
use App\Services\AuditLogger;
use App\Services\CustomerPaymentPostingService;
use App\Services\DocumentReferenceGenerator;
use App\Services\IdempotencyService;
use App\Services\PaymentMethodRegistry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CreditCollectionController extends Controller
{
    use HandlesTransferCommands;

    public function __construct(
        private readonly DocumentReferenceGenerator $references,
        private readonly IdempotencyService $idempotency,
        private readonly CustomerPaymentPostingService $posting,
        private readonly PaymentMethodRegistry $paymentMethods,
        private readonly AuditLogger $auditLogger,
    ) {}

    public function store(Request $request): JsonResponse
    {
        $representative = $this->representative($request);
        $trip = Trip::query()->where('sales_representative_id', $representative->id)->where('status', TripStatus::Operation)->latest('id')->first();
        if (! $trip) {
            throw new DomainConflictException('Customer credit can only be collected during trip operation.', 'NO_OPERATING_TRIP');
        }
        if (! $request->filled('payment_method')) {
            $request->merge(['payment_method' => $this->paymentMethods->defaultKey()]);
        }
        $data = $request->validate([
            'customer_id' => ['required', 'integer', 'exists:customers,id'],
            'amount' => ['required', 'integer', 'min:1', 'max:999999999999999'],
            'payment_method' => ['required', Rule::in($this->paymentMethods->activeKeys())],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);
        $customer = Customer::query()->with('creditBalance')->whereKey($data['customer_id'])->where('region_id', $trip->region_id)->where('is_active', true)->firstOrFail();
        if (! $customer->credit_allowed || (int) ($customer->creditBalance?->outstanding_amount ?? 0) <= 0) {
            throw new DomainConflictException('This customer has no outstanding credit to collect.', 'NO_CUSTOMER_CREDIT');
        }

        $key = $this->idempotencyKey($request);
        $result = $this->idempotency->execute($request->user(), 'trip-credit-collection:create', $key, function () use ($request, $trip, $representative, $customer, $data, $key): array {
            $payment = CustomerPayment::query()->create([
                'trip_id' => $trip->id,
                'sales_representative_id' => $representative->id,
                'reference' => $this->references->next('customer_payment', 'PAY'),
                'warehouse_id' => $trip->warehouse_id,
                'customer_id' => $customer->id,
                'amount' => $data['amount'],
                'payment_date' => now()->toDateString(),
                'payment_method' => $data['payment_method'],
                'notes' => $data['notes'] ?? null,
                'status' => CustomerPaymentStatus::Draft,
                'received_by' => $request->user()->id,
                'created_by' => $request->user()->id,
            ]);
            $this->auditLogger->record($request, 'customer_payment.created', $request->user(), $payment, ['trip_id' => $trip->id, 'created_from' => 'sales_app']);
            $this->posting->post($payment, $request->user(), $key.'-post', $request);

            return ['id' => $payment->id];
        });

        $payment = CustomerPayment::query()->with(['trip', 'representative', 'warehouse', 'customer', 'receiver', 'creator', 'poster', 'voider'])->findOrFail($result['id']);
        $outstanding = (int) $customer->creditBalance()->value('outstanding_amount');

        return response()->json(['data' => (new CustomerPaymentResource($payment))->resolve($request), 'outstanding_amount' => $outstanding], 201);
    }

    private function representative(Request $request): SalesRepresentative
    {
        $representative = $request->user()->salesRepresentative;
        abort_unless($representative?->is_active, 403);

        return $representative;
    }
}
